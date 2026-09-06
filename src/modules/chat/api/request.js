export const buildChatRequestHeaders = ({ token, stream }) => ({
  Accept: stream ? 'text/event-stream' : 'application/json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

/*
 * OpenRouter exposes only content-type and cf-ray to browser JavaScript, so rate-limit
 * headers are unreadable cross-origin. Usage data must come from GET /api/v1/key instead.
 */
export const parseRateMetadata = () => ({
  remaining: null,
  resetEpochSeconds: null,
})

export const toApiError = ({ message, status, rateLimit }) => {
  const error = new Error(message)
  error.status = typeof status === 'number' ? status : null
  error.rateLimit = rateLimit
  return error
}

const statusMessages = {
  401: 'OpenRouter rejected the API key. Re-enter it or create a new one.',
  402: 'OpenRouter credits exhausted. Add credits or switch to a free model.',
  404: 'That model is not available on OpenRouter. Choose a different model.',
  429: 'Rate limited by OpenRouter. Free models allow 50 requests per day without purchased credits.',
}
const extractErrorMessage = body => {
  if (!body || typeof body !== 'object') {
    return ''
  }

  const nested = body.error
  if (nested && typeof nested === 'object' && typeof nested.message === 'string') {
    return nested.message.trim()
  }

  if (typeof body.message === 'string') {
    return body.message.trim()
  }

  return ''
}

export const parseErrorResponse = async response => {
  let body = null

  try {
    body = await response.json()
  } catch {
    /* noop */
  }

  const providerMessage = extractErrorMessage(body)
  const statusMessage = statusMessages[response.status]
  const fallbackMessage =
    providerMessage || `Chat request failed with status ${response.status}`

  return {
    message: statusMessage ?? fallbackMessage,
    status: response.status,
    rateLimit: parseRateMetadata(),
  }
}
