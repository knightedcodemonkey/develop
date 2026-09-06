const openRouterKeyStorageKey = 'knighted:develop:openrouter-key'

const safelyGetItem = key => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safelySetItem = (key, value) => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const safelyRemoveItem = key => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

export const loadOpenRouterKey = () => safelyGetItem(openRouterKeyStorageKey)

export const saveOpenRouterKey = key => {
  if (typeof key !== 'string') {
    return false
  }

  const normalizedKey = key.trim()
  if (!normalizedKey) {
    return false
  }

  return safelySetItem(openRouterKeyStorageKey, normalizedKey)
}

export const clearOpenRouterKey = () => {
  safelyRemoveItem(openRouterKeyStorageKey)
}

export const maskOpenRouterKey = key => {
  if (typeof key !== 'string') {
    return ''
  }

  const normalizedKey = key.trim()
  if (normalizedKey.length <= 8) {
    return '*'.repeat(Math.max(0, normalizedKey.length))
  }

  return `${normalizedKey.slice(0, 4)}${'*'.repeat(
    normalizedKey.length - 8,
  )}${normalizedKey.slice(-4)}`
}
