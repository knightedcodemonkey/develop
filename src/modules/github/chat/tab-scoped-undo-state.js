const toTabId = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

const createTabScopedUndoState = () => {
  const snapshotsByTabId = new Map()

  const getSnapshot = tabId => {
    const normalizedTabId = toTabId(tabId)
    if (!normalizedTabId) {
      return null
    }

    return snapshotsByTabId.get(normalizedTabId) ?? null
  }

  const setSnapshot = ({ tabId, snapshot }) => {
    const normalizedTabId = toTabId(tabId)
    if (!normalizedTabId) {
      return
    }

    snapshotsByTabId.set(normalizedTabId, snapshot)
  }

  const clearSnapshot = tabId => {
    const normalizedTabId = toTabId(tabId)
    if (!normalizedTabId) {
      return
    }

    snapshotsByTabId.delete(normalizedTabId)
  }

  return {
    clearAll: () => {
      snapshotsByTabId.clear()
    },
    getSnapshot,
    setSnapshot,
    clearSnapshot,
  }
}

export { createTabScopedUndoState }
