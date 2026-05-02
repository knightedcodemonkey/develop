const githubTokenStorageKey = 'knighted:develop:github-pat'

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

export const loadGitHubToken = () => safelyGetItem(githubTokenStorageKey)

export const saveGitHubToken = token => {
  if (typeof token !== 'string') {
    return false
  }

  const normalizedToken = token.trim()
  if (!normalizedToken) {
    return false
  }

  return safelySetItem(githubTokenStorageKey, normalizedToken)
}

export const clearGitHubToken = () => {
  safelyRemoveItem(githubTokenStorageKey)
}

export const maskGitHubToken = token => {
  if (typeof token !== 'string') {
    return ''
  }

  const normalizedToken = token.trim()
  if (normalizedToken.length <= 8) {
    return '*'.repeat(Math.max(0, normalizedToken.length))
  }

  return `${normalizedToken.slice(0, 4)}${'*'.repeat(
    normalizedToken.length - 8,
  )}${normalizedToken.slice(-4)}`
}
