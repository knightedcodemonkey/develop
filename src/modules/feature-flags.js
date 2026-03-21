const aiFeatureStorageKey = 'knighted:develop:feature:ai-assistant'
const aiFeatureQueryKey = 'feature-ai'

const parseBooleanLikeValue = value => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (['1', 'true', 'on', 'yes', 'enabled'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'off', 'no', 'disabled'].includes(normalized)) {
    return false
  }

  return null
}

const readBooleanFromLocalStorage = key => {
  try {
    const storedValue = localStorage.getItem(key)
    return parseBooleanLikeValue(storedValue)
  } catch {
    return null
  }
}

const readBooleanFromQueryParam = key => {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  if (!params.has(key)) {
    return null
  }

  return parseBooleanLikeValue(params.get(key))
}

export const isAiAssistantFeatureEnabled = () => {
  const queryValue = readBooleanFromQueryParam(aiFeatureQueryKey)
  if (queryValue !== null) {
    return queryValue
  }

  const localStorageValue = readBooleanFromLocalStorage(aiFeatureStorageKey)
  if (localStorageValue !== null) {
    return localStorageValue
  }

  return false
}

export const setAiAssistantFeatureEnabled = isEnabled => {
  try {
    localStorage.setItem(aiFeatureStorageKey, isEnabled ? 'true' : 'false')
  } catch {
    /* noop */
  }
}
