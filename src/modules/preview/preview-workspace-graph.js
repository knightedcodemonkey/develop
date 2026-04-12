const normalizeImportSpecifier = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null

const normalizeGraphEntry = entry => {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  if (typeof entry.tabId !== 'string' || entry.tabId.length === 0) {
    return null
  }

  const imports = Array.isArray(entry.imports)
    ? entry.imports.map(normalizeImportSpecifier).filter(Boolean)
    : []

  return {
    tabId: entry.tabId,
    contentHash: typeof entry.contentHash === 'string' ? entry.contentHash : '',
    imports,
    lastUpdated:
      typeof entry.lastUpdated === 'number' && Number.isFinite(entry.lastUpdated)
        ? entry.lastUpdated
        : Date.now(),
  }
}

export const createPreviewWorkspaceGraphCache = () => {
  const byTabId = new Map()

  const upsert = entry => {
    const normalized = normalizeGraphEntry(entry)

    if (!normalized) {
      throw new TypeError('Graph entry is invalid.')
    }

    byTabId.set(normalized.tabId, normalized)
    return normalized
  }

  const get = tabId => {
    if (typeof tabId !== 'string' || tabId.length === 0) {
      return null
    }

    return byTabId.get(tabId) ?? null
  }

  const getDependents = targetImportSpecifier => {
    const normalizedSpecifier = normalizeImportSpecifier(targetImportSpecifier)

    if (!normalizedSpecifier) {
      return []
    }

    const dependents = []

    for (const entry of byTabId.values()) {
      if (entry.imports.includes(normalizedSpecifier)) {
        dependents.push(entry)
      }
    }

    return dependents
  }

  const remove = tabId => {
    if (typeof tabId !== 'string' || tabId.length === 0) {
      return false
    }

    return byTabId.delete(tabId)
  }

  const clear = () => {
    byTabId.clear()
  }

  const list = () => [...byTabId.values()]

  return {
    upsert,
    get,
    getDependents,
    remove,
    clear,
    list,
  }
}
