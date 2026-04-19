import { githubApiBaseUrl } from './constants.js'

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

const encodePathForApi = path =>
  path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const buildRepoApiUrl = ({ owner, repo, path }) =>
  `${githubApiBaseUrl}/repos/${owner}/${repo}${path}`

export {
  buildChatRequestHeaders,
  buildRepoApiUrl,
  buildRequestHeaders,
  encodePathForApi,
  fetchJson,
  parseErrorResponse,
  parseRateMetadata,
  requestGitHubJson,
  toApiError,
}
