const defaultFontCssUrl =
  'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap'

const resolveCurrentProtocol = () => {
  if (typeof window === 'undefined' || !window?.location?.protocol) {
    return ''
  }

  return String(window.location.protocol).toLowerCase()
}

const normalizeFontCssUrl = (
  value,
  { fallback = defaultFontCssUrl, currentProtocol = resolveCurrentProtocol() } = {},
) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return fallback
  }

  try {
    const parsed = new URL(normalized)
    const protocol = parsed.protocol.toLowerCase()
    const allowHttp = String(currentProtocol).toLowerCase() === 'http:'
    if (protocol === 'http:' && !allowHttp) {
      return fallback
    }
    if (protocol !== 'https:' && protocol !== 'http:') {
      return fallback
    }

    return parsed.href
  } catch {
    return fallback
  }
}

export { defaultFontCssUrl, normalizeFontCssUrl }
