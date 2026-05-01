const previewEntryNamePattern = /(?:^|\/)(?:app|main)\.[jt]sx?$/i
const reactCompatibleEntryNamePattern = /(?:^|\/)[^/]+\.(?:tsx|jsx|js)$/i
const reactEntryTabCompatibilityErrorName = 'ReactEntryTabCompatibilityError'
const reactEntryTabCompatibilityErrorMessage =
  'React mode requires the entry tab to end in .tsx, .jsx, or .js.'

const normalizeTabIdentity = tab => {
  if (!tab || typeof tab !== 'object') {
    return ''
  }

  if (typeof tab.path === 'string' && tab.path.trim().length > 0) {
    return tab.path.trim()
  }

  if (typeof tab.name === 'string' && tab.name.trim().length > 0) {
    return tab.name.trim()
  }

  return ''
}

export const isPreviewEntryTab = tab =>
  previewEntryNamePattern.test(normalizeTabIdentity(tab))

export const resolvePreviewEntryTab = tabs => {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return null
  }

  const explicitEntry = tabs.find(
    tab => tab && typeof tab === 'object' && tab.role === 'entry',
  )

  if (explicitEntry) {
    return explicitEntry
  }

  return tabs.find(isPreviewEntryTab) ?? null
}

export const canRenderPreview = ({ tabs, fallbackSource = '' } = {}) => {
  if (Array.isArray(tabs) && tabs.length > 0) {
    return Boolean(resolvePreviewEntryTab(tabs))
  }

  return typeof fallbackSource === 'string' && fallbackSource.trim().length > 0
}

export const getReactEntryTabCompatibilityError = tab => {
  const identity = normalizeTabIdentity(tab)
  if (!identity || reactCompatibleEntryNamePattern.test(identity)) {
    return null
  }

  const error = new Error(reactEntryTabCompatibilityErrorMessage)
  error.name = reactEntryTabCompatibilityErrorName
  return error
}

export { reactEntryTabCompatibilityErrorMessage, reactEntryTabCompatibilityErrorName }
