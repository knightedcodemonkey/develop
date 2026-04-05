const previewEntryNamePattern = /(?:^|\/)(?:app|main)\.[jt]sx?$/i

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

  return tabs.find(isPreviewEntryTab) ?? null
}

export const canRenderPreview = ({ tabs, fallbackSource = '' } = {}) => {
  if (Array.isArray(tabs) && tabs.length > 0) {
    return Boolean(resolvePreviewEntryTab(tabs))
  }

  return typeof fallbackSource === 'string' && fallbackSource.trim().length > 0
}
