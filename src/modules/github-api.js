const githubApiBaseUrl = 'https://api.github.com'
const githubModelsApiUrl = 'https://models.github.ai/inference/chat/completions'

export const defaultGitHubChatModel = 'openai/gpt-4.1-mini'

const parseNextPageUrlFromLinkHeader = linkHeader => {
  if (typeof linkHeader !== 'string' || !linkHeader.trim()) {
    return null
  }

  const segments = linkHeader.split(',')

  for (const segment of segments) {
    const parts = segment
      .trim()
      .split(';')
      .map(part => part.trim())
    if (parts.length < 2) {
      continue
    }

    const urlPart = parts[0]
    const relPart = parts[1]

    if (!urlPart.startsWith('<') || !urlPart.endsWith('>')) {
      continue
    }

    if (relPart !== 'rel="next"') {
      continue
    }

    return urlPart.slice(1, -1)
  }

  return null
}

const normalizeRepo = repo => {
  const owner = repo?.owner?.login
  const name = repo?.name
  const fullName = repo?.full_name

  if (
    typeof owner !== 'string' ||
    typeof name !== 'string' ||
    typeof fullName !== 'string'
  ) {
    return null
  }

  return {
    id: repo.id,
    owner,
    name,
    fullName,
    defaultBranch: typeof repo.default_branch === 'string' ? repo.default_branch : 'main',
    permissions: repo.permissions ?? {},
    htmlUrl: typeof repo.html_url === 'string' ? repo.html_url : null,
  }
}

const hasWritePermission = permissions => Boolean(permissions && permissions.push)

const buildRequestHeaders = token => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
})

const buildChatRequestHeaders = ({ token, stream }) => ({
  Accept: stream ? 'text/event-stream' : 'application/json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
})

const toFiniteNumber = value => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const parseRateMetadataFromHeaders = headers => {
  if (!headers || typeof headers.get !== 'function') {
    return {
      remaining: null,
      resetEpochSeconds: null,
    }
  }

  const remaining =
    toFiniteNumber(headers.get('x-ratelimit-remaining')) ??
    toFiniteNumber(headers.get('ratelimit-remaining'))

  const resetEpochSeconds =
    toFiniteNumber(headers.get('x-ratelimit-reset')) ??
    toFiniteNumber(headers.get('ratelimit-reset'))

  return {
    remaining,
    resetEpochSeconds,
  }
}

const parseRateMetadataFromBody = body => {
  if (!body || typeof body !== 'object') {
    return {
      remaining: null,
      resetEpochSeconds: null,
    }
  }

  const rateLimit = body.rate_limit ?? body.rateLimit ?? null

  const remaining =
    toFiniteNumber(rateLimit?.remaining) ?? toFiniteNumber(body.remaining) ?? null

  const resetEpochSeconds =
    toFiniteNumber(rateLimit?.reset) ??
    toFiniteNumber(rateLimit?.reset_epoch_seconds) ??
    toFiniteNumber(rateLimit?.resetEpochSeconds) ??
    toFiniteNumber(body.reset) ??
    null

  return {
    remaining,
    resetEpochSeconds,
  }
}

const mergeRateMetadata = (primary, fallback) => ({
  remaining: primary.remaining ?? fallback.remaining ?? null,
  resetEpochSeconds: primary.resetEpochSeconds ?? fallback.resetEpochSeconds ?? null,
})

const parseRateMetadata = ({ headers, body }) => {
  const fromHeaders = parseRateMetadataFromHeaders(headers)
  const fromBody = parseRateMetadataFromBody(body)
  return mergeRateMetadata(fromHeaders, fromBody)
}

const toApiError = ({ message, rateLimit }) => {
  const error = new Error(message)
  error.rateLimit = rateLimit
  return error
}

const normalizeChatMessage = message => {
  if (!message || typeof message !== 'object') {
    return null
  }

  const role =
    message.role === 'system' || message.role === 'assistant' ? message.role : 'user'
  const content = typeof message.content === 'string' ? message.content.trim() : ''

  if (!content) {
    return null
  }

  return { role, content }
}

const normalizeChatMessages = messages => {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map(normalizeChatMessage).filter(Boolean)
}

const buildChatBody = ({ model, messages, stream }) => {
  const normalizedMessages = normalizeChatMessages(messages)

  return {
    model,
    messages: normalizedMessages,
    stream,
  }
}

const extractContentFromMessage = message => {
  if (!message || typeof message !== 'object') {
    return ''
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (!Array.isArray(message.content)) {
    return ''
  }

  return message.content
    .map(part => {
      if (typeof part === 'string') {
        return part
      }

      if (
        part &&
        typeof part === 'object' &&
        part.type === 'text' &&
        typeof part.text === 'string'
      ) {
        return part.text
      }

      return ''
    })
    .join('')
}

const extractChatCompletionText = body => {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null

  if (!firstChoice || typeof firstChoice !== 'object') {
    return ''
  }

  const message = firstChoice.message
  return extractContentFromMessage(message).trim()
}

const extractStreamingDeltaText = body => {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null

  if (!firstChoice || typeof firstChoice !== 'object') {
    return ''
  }

  if (typeof firstChoice.delta?.content === 'string') {
    return firstChoice.delta.content
  }

  return ''
}

const parseSseDataLine = line => {
  if (typeof line !== 'string') {
    return null
  }

  const trimmedLine = line.trim()
  if (!trimmedLine.startsWith('data:')) {
    return null
  }

  const payload = trimmedLine.slice(5).trim()
  if (!payload || payload === '[DONE]') {
    return null
  }

  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

const parseErrorResponse = async response => {
  let body = null

  try {
    body = await response.json()
  } catch {
    /* noop */
  }

  const message =
    body && typeof body.message === 'string' && body.message.trim()
      ? body.message
      : `GitHub API request failed with status ${response.status}`

  return {
    message,
    rateLimit: parseRateMetadata({ headers: response.headers, body }),
  }
}

const fetchJson = async ({ token, url, signal }) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: buildRequestHeaders(token),
    signal,
  })

  if (!response.ok) {
    const { message, rateLimit } = await parseErrorResponse(response)
    throw toApiError({ message, rateLimit })
  }

  return {
    data: await response.json(),
    nextPageUrl: parseNextPageUrlFromLinkHeader(response.headers.get('link')),
  }
}

const listReposPage = async ({ token, url, signal }) => {
  const { data, nextPageUrl } = await fetchJson({ token, url, signal })

  if (!Array.isArray(data)) {
    throw new Error('Unexpected response while loading repositories from GitHub.')
  }

  return {
    repos: data.map(normalizeRepo).filter(Boolean),
    nextPageUrl,
  }
}

export const listWritableRepositories = async ({ token, signal }) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to load repositories.')
  }

  const writableRepos = []
  const dedupeById = new Set()
  let nextPageUrl = `${githubApiBaseUrl}/user/repos?sort=updated&per_page=100`
  let remainingPageBudget = 10

  while (nextPageUrl && remainingPageBudget > 0) {
    /* GitHub pagination is cursor-like via Link headers, so each request depends on the previous page. */
    // eslint-disable-next-line no-await-in-loop
    const page = await listReposPage({ token, url: nextPageUrl, signal })
    for (const repo of page.repos) {
      if (!hasWritePermission(repo.permissions) || dedupeById.has(repo.id)) {
        continue
      }
      dedupeById.add(repo.id)
      writableRepos.push(repo)
    }

    nextPageUrl = page.nextPageUrl
    remainingPageBudget -= 1
  }

  writableRepos.sort((left, right) => left.fullName.localeCompare(right.fullName))

  return writableRepos
}

export const streamGitHubChatCompletion = async ({
  token,
  messages,
  signal,
  onToken,
  model = defaultGitHubChatModel,
}) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to start a chat request.')
  }

  const normalizedMessages = normalizeChatMessages(messages)
  if (normalizedMessages.length === 0) {
    throw new Error('At least one message is required to start a chat request.')
  }

  const response = await fetch(githubModelsApiUrl, {
    method: 'POST',
    headers: buildChatRequestHeaders({ token, stream: true }),
    body: JSON.stringify(
      buildChatBody({ model, messages: normalizedMessages, stream: true }),
    ),
    signal,
  })

  if (!response.ok) {
    const { message, rateLimit } = await parseErrorResponse(response)
    throw toApiError({ message, rateLimit })
  }

  if (!response.body) {
    throw new Error('Streaming response body is not available in this browser.')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffered = ''
  let combined = ''
  let responseModel = ''

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''

    for (const line of lines) {
      const body = parseSseDataLine(line)
      if (!body) {
        continue
      }

      if (!responseModel && typeof body.model === 'string') {
        responseModel = body.model
      }

      const chunk = extractStreamingDeltaText(body)
      if (!chunk) {
        continue
      }

      combined += chunk
      onToken?.(chunk)
    }
  }

  if (buffered.trim()) {
    const body = parseSseDataLine(buffered)
    if (body && !responseModel && typeof body.model === 'string') {
      responseModel = body.model
    }
    const chunk = body ? extractStreamingDeltaText(body) : ''
    if (chunk) {
      combined += chunk
      onToken?.(chunk)
    }
  }

  if (!combined.trim()) {
    throw new Error('Streaming response did not include assistant content.')
  }

  return {
    content: combined,
    model: responseModel || model,
    rateLimit: parseRateMetadata({ headers: response.headers, body: null }),
  }
}

export const requestGitHubChatCompletion = async ({
  token,
  messages,
  signal,
  model = defaultGitHubChatModel,
}) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to start a chat request.')
  }

  const normalizedMessages = normalizeChatMessages(messages)
  if (normalizedMessages.length === 0) {
    throw new Error('At least one message is required to start a chat request.')
  }

  const response = await fetch(githubModelsApiUrl, {
    method: 'POST',
    headers: buildChatRequestHeaders({ token, stream: false }),
    body: JSON.stringify(
      buildChatBody({ model, messages: normalizedMessages, stream: false }),
    ),
    signal,
  })

  if (!response.ok) {
    const { message, rateLimit } = await parseErrorResponse(response)
    throw toApiError({ message, rateLimit })
  }

  const body = await response.json()
  const content = extractChatCompletionText(body)

  if (!content) {
    throw new Error('GitHub chat response did not include assistant content.')
  }

  return {
    content,
    model: typeof body?.model === 'string' && body.model ? body.model : model,
    rateLimit: parseRateMetadata({ headers: response.headers, body }),
  }
}
