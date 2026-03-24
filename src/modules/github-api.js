const githubApiBaseUrl = 'https://api.github.com'
const githubModelsApiUrl = 'https://models.github.ai/inference/chat/completions'

export const defaultGitHubChatModel = 'openai/gpt-4.1-mini'

/* Local model options avoid browser CORS failures when calling catalog endpoints directly. */
export const githubChatModelOptions = [
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-5',
  'openai/gpt-5-chat',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/o1',
  'openai/o1-mini',
  'openai/o1-preview',
  'openai/o3',
  'openai/o3-mini',
  'openai/o4-mini',
  'ai21-labs/ai21-jamba-1.5-large',
  'cohere/cohere-command-a',
  'cohere/cohere-command-r-08-2024',
  'cohere/cohere-command-r-plus-08-2024',
  'xai/grok-3',
  'xai/grok-3-mini',
  'deepseek/deepseek-r1',
  'deepseek/deepseek-r1-0528',
  'deepseek/deepseek-v3-0324',
  'meta/llama-3.2-11b-vision-instruct',
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-4-maverick-17b-128e-instruct-fp8',
  'meta/llama-4-scout-17b-16e-instruct',
  'meta/meta-llama-3.1-405b-instruct',
  'meta/meta-llama-3.1-8b-instruct',
  'mistral-ai/codestral-2501',
  'mistral-ai/ministral-3b',
  'mistral-ai/mistral-medium-2505',
  'mistral-ai/mistral-small-2503',
  'microsoft/mai-ds-r1',
  'microsoft/phi-4',
  'microsoft/phi-4-mini-instruct',
  'microsoft/phi-4-mini-reasoning',
  'microsoft/phi-4-multimodal-instruct',
  'microsoft/phi-4-reasoning',
]

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

const normalizeBranchName = branch => {
  if (!branch || typeof branch !== 'object') {
    return null
  }

  return typeof branch.name === 'string' && branch.name.trim() ? branch.name : null
}

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

const listBranchesPage = async ({ token, url, signal }) => {
  const { data, nextPageUrl } = await fetchJson({ token, url, signal })

  if (!Array.isArray(data)) {
    throw new Error('Unexpected response while loading repository branches from GitHub.')
  }

  return {
    branches: data.map(normalizeBranchName).filter(Boolean),
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

export const listRepositoryBranches = async ({ token, owner, repo, signal }) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to load branches.')
  }

  if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) {
    throw new Error('A valid repository owner/name is required to load branches.')
  }

  const branches = []
  const dedupe = new Set()
  let nextPageUrl = `${githubApiBaseUrl}/repos/${owner}/${repo}/branches?per_page=100`
  let remainingPageBudget = 5

  while (nextPageUrl && remainingPageBudget > 0) {
    /* Branch pagination depends on the prior Link header response. */
    // eslint-disable-next-line no-await-in-loop
    const page = await listBranchesPage({ token, url: nextPageUrl, signal })
    for (const name of page.branches) {
      if (dedupe.has(name)) {
        continue
      }

      dedupe.add(name)
      branches.push(name)
    }

    nextPageUrl = page.nextPageUrl
    remainingPageBudget -= 1
  }

  branches.sort((left, right) => left.localeCompare(right))
  return branches
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

const encodePathForApi = path =>
  path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const requestGitHubJson = async ({
  token,
  url,
  method = 'GET',
  body,
  signal,
  allowNotFound = false,
}) => {
  const headers = {
    ...buildRequestHeaders(token),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  if (allowNotFound && response.status === 404) {
    return null
  }

  if (!response.ok) {
    const { message, rateLimit } = await parseErrorResponse(response)
    throw toApiError({ message, rateLimit })
  }

  return response.json()
}

export const getBranchReferenceSha = async ({ token, owner, repo, branch, signal }) => {
  const ref = encodeURIComponent(`heads/${branch}`)
  const response = await requestGitHubJson({
    token,
    url: `${githubApiBaseUrl}/repos/${owner}/${repo}/git/ref/${ref}`,
    signal,
  })

  const sha = response?.object?.sha
  if (typeof sha !== 'string' || !sha) {
    throw new Error(`Could not resolve SHA for ${owner}/${repo}@${branch}`)
  }

  return sha
}

export const createBranchReference = async ({
  token,
  owner,
  repo,
  branch,
  sha,
  signal,
}) => {
  const response = await requestGitHubJson({
    token,
    url: `${githubApiBaseUrl}/repos/${owner}/${repo}/git/refs`,
    method: 'POST',
    body: {
      ref: `refs/heads/${branch}`,
      sha,
    },
    signal,
  })

  const createdRef = response?.ref
  if (typeof createdRef !== 'string' || !createdRef) {
    throw new Error(`Could not create branch ${branch} in ${owner}/${repo}`)
  }

  return createdRef
}

export const getRepositoryFileMetadata = async ({
  token,
  owner,
  repo,
  path,
  ref,
  signal,
}) => {
  const encodedPath = encodePathForApi(path)
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const response = await requestGitHubJson({
    token,
    url: `${githubApiBaseUrl}/repos/${owner}/${repo}/contents/${encodedPath}${query}`,
    signal,
    allowNotFound: true,
  })

  if (!response) {
    return null
  }

  return {
    sha: typeof response.sha === 'string' ? response.sha : null,
  }
}

const toUtf8Base64 = value => {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  const chunkSize = 0x8000
  const chunks = []

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }

  return btoa(chunks.join(''))
}

const isMissingShaForExistingFileError = error => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('sha') &&
    (message.includes('already exists') || message.includes('must be supplied'))
  )
}

export const upsertRepositoryFile = async ({
  token,
  owner,
  repo,
  branch,
  path,
  content,
  message,
  signal,
}) => {
  const encodedPath = encodePathForApi(path)

  const baseBody = {
    message,
    content: toUtf8Base64(content),
    branch,
  }

  try {
    const response = await requestGitHubJson({
      token,
      url: `${githubApiBaseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`,
      method: 'PUT',
      body: baseBody,
      signal,
    })

    return {
      path,
      commitSha: typeof response?.commit?.sha === 'string' ? response.commit.sha : null,
      created: true,
    }
  } catch (error) {
    if (!isMissingShaForExistingFileError(error)) {
      throw error
    }

    const existingFile = await getRepositoryFileMetadata({
      token,
      owner,
      repo,
      path,
      ref: branch,
      signal,
    })

    if (!existingFile?.sha) {
      throw error
    }

    const response = await requestGitHubJson({
      token,
      url: `${githubApiBaseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`,
      method: 'PUT',
      body: {
        ...baseBody,
        sha: existingFile.sha,
      },
      signal,
    })

    return {
      path,
      commitSha: typeof response?.commit?.sha === 'string' ? response.commit.sha : null,
      created: false,
    }
  }
}

export const createRepositoryPullRequest = async ({
  token,
  owner,
  repo,
  title,
  body,
  head,
  base,
  signal,
}) => {
  const response = await requestGitHubJson({
    token,
    url: `${githubApiBaseUrl}/repos/${owner}/${repo}/pulls`,
    method: 'POST',
    body: {
      title,
      body,
      head,
      base,
    },
    signal,
  })

  return {
    number: response?.number,
    htmlUrl: typeof response?.html_url === 'string' ? response.html_url : '',
    apiUrl: typeof response?.url === 'string' ? response.url : '',
  }
}

const isReferenceAlreadyExistsError = error => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('reference already exists') || message.includes('already exists')
  )
}

const createUniqueBranchReference = async ({
  token,
  owner,
  repo,
  headBranch,
  baseSha,
  signal,
  attempt = 0,
}) => {
  const candidateBranch = attempt === 0 ? headBranch : `${headBranch}-${attempt + 1}`

  try {
    await createBranchReference({
      token,
      owner,
      repo,
      branch: candidateBranch,
      sha: baseSha,
      signal,
    })
    return candidateBranch
  } catch (error) {
    if (!isReferenceAlreadyExistsError(error)) {
      throw error
    }

    if (attempt >= 4) {
      throw new Error(
        `Branch ${headBranch} already exists. Choose another branch name and retry.`,
        {
          cause: error,
        },
      )
    }

    return createUniqueBranchReference({
      token,
      owner,
      repo,
      headBranch,
      baseSha,
      signal,
      attempt: attempt + 1,
    })
  }
}

export const createEditorContentPullRequest = async ({
  token,
  repository,
  baseBranch,
  headBranch,
  prTitle,
  prBody,
  componentFilePath,
  componentSource,
  stylesFilePath,
  stylesSource,
  commitMessage,
  signal,
}) => {
  const owner = repository?.owner
  const repo = repository?.name

  if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) {
    throw new Error('A valid repository selection is required.')
  }

  const baseSha = await getBranchReferenceSha({
    token,
    owner,
    repo,
    branch: baseBranch,
    signal,
  })

  const nextBranch = await createUniqueBranchReference({
    token,
    owner,
    repo,
    headBranch,
    baseSha,
    signal,
  })

  const fileUpdates = []

  fileUpdates.push(
    await upsertRepositoryFile({
      token,
      owner,
      repo,
      branch: nextBranch,
      path: componentFilePath,
      content: componentSource,
      message: commitMessage,
      signal,
    }),
  )

  if (stylesFilePath !== componentFilePath) {
    fileUpdates.push(
      await upsertRepositoryFile({
        token,
        owner,
        repo,
        branch: nextBranch,
        path: stylesFilePath,
        content: stylesSource,
        message: commitMessage,
        signal,
      }),
    )
  }

  const pullRequest = await createRepositoryPullRequest({
    token,
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: nextBranch,
    base: baseBranch,
    signal,
  })

  return {
    pullRequest,
    branch: nextBranch,
    fileUpdates,
  }
}
