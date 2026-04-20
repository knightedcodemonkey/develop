const createWorkspaceActiveRecordStorage = ({
  storageKey = 'knighted:develop:active-workspace-id',
} = {}) => {
  const toNonEmptyText = value =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''

  const load = () => {
    try {
      return toNonEmptyText(localStorage.getItem(storageKey))
    } catch {
      return ''
    }
  }

  const persist = value => {
    const normalized = toNonEmptyText(value)

    try {
      if (normalized) {
        localStorage.setItem(storageKey, normalized)
        return normalized
      }

      localStorage.removeItem(storageKey)
      return ''
    } catch {
      return normalized
    }
  }

  return {
    load,
    persist,
  }
}

export { createWorkspaceActiveRecordStorage }
