export const buildChatRequestHeaders = ({ token, stream }) => ({
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

export const parseRateMetadata = ({ headers, body }) => {
  const fromHeaders = parseRateMetadataFromHeaders(headers)
  const fromBody = parseRateMetadataFromBody(body)
  return mergeRateMetadata(fromHeaders, fromBody)
}

export const toApiError = ({ message, rateLimit }) => {
  const error = new Error(message)
  error.rateLimit = rateLimit
  return error
}

export const parseErrorResponse = async response => {
  let body = null

  try {
    body = await response.json()
  } catch {
    /* noop */
  }

  const message =
    body && typeof body.message === 'string' && body.message.trim()
      ? body.message
      : `Chat API request failed with status ${response.status}`

  return {
    message,
    rateLimit: parseRateMetadata({ headers: response.headers, body }),
  }
}
