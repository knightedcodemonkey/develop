const toNonEmptyString = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''

const toTabRole = value => {
  const normalized = toNonEmptyString(value).toLowerCase()
  if (normalized === 'entry') {
    return 'entry'
  }

  return 'module'
}

const normalizeTab = (tab, fallbackId = '') => {
  if (!tab || typeof tab !== 'object') {
    return null
  }

  const id =
    toNonEmptyString(tab.id) ||
    toNonEmptyString(tab.path) ||
    toNonEmptyString(tab.name) ||
    toNonEmptyString(fallbackId)

  if (!id) {
    return null
  }

  return {
    id,
    name: toNonEmptyString(tab.name) || id,
    path: toNonEmptyString(tab.path),
    language: toNonEmptyString(tab.language) || 'plaintext',
    role: toTabRole(tab.role),
    isActive: Boolean(tab.isActive),
    scroll: Number.isFinite(tab.scroll) ? Math.max(0, tab.scroll) : 0,
    content: typeof tab.content === 'string' ? tab.content : '',
    lastModified: Number.isFinite(tab.lastModified) ? tab.lastModified : Date.now(),
  }
}

const cloneTab = tab => ({ ...tab })

const createSnapshot = ({ orderedIds, tabsById, activeTabId }) => ({
  tabs: orderedIds.map(tabId => cloneTab(tabsById.get(tabId))).filter(Boolean),
  activeTabId,
})

export const createWorkspaceTabsState = ({ tabs = [], activeTabId, onChange } = {}) => {
  const orderedIds = []
  const tabsById = new Map()

  const emit = reason => {
    if (typeof onChange !== 'function') {
      return
    }

    onChange({
      reason,
      ...createSnapshot({
        orderedIds,
        tabsById,
        activeTabId: getActiveTabId(),
      }),
    })
  }

  const getActiveTabId = () => {
    if (toNonEmptyString(activeTabId) && tabsById.has(activeTabId)) {
      return activeTabId
    }

    if (orderedIds.length === 0) {
      return ''
    }

    return orderedIds[0]
  }

  const replaceTabs = ({ nextTabs, nextActiveTabId, emitReason = 'replaceTabs' }) => {
    orderedIds.length = 0
    tabsById.clear()

    for (const [index, inputTab] of nextTabs.entries()) {
      const normalized = normalizeTab(inputTab, `tab-${index + 1}`)

      if (!normalized || tabsById.has(normalized.id)) {
        continue
      }

      tabsById.set(normalized.id, normalized)
      orderedIds.push(normalized.id)
    }

    if (orderedIds.length === 0) {
      const fallback = normalizeTab({ id: 'component', name: 'Component' })
      tabsById.set(fallback.id, fallback)
      orderedIds.push(fallback.id)
    }

    const candidateActive = toNonEmptyString(nextActiveTabId)
    activeTabId =
      candidateActive && tabsById.has(candidateActive)
        ? candidateActive
        : orderedIds.find(tabId => tabsById.get(tabId)?.isActive) || orderedIds[0]

    for (const tabId of orderedIds) {
      const tab = tabsById.get(tabId)
      tab.isActive = tabId === activeTabId
    }

    emit(emitReason)
  }

  const getTabs = () =>
    orderedIds.map(tabId => cloneTab(tabsById.get(tabId))).filter(Boolean)

  const getTab = tabId => {
    const id = toNonEmptyString(tabId)
    if (!id || !tabsById.has(id)) {
      return null
    }

    return cloneTab(tabsById.get(id))
  }

  const upsertTab = (tab, { emitReason = 'upsertTab' } = {}) => {
    const normalized = normalizeTab(tab)

    if (!normalized) {
      return null
    }

    const previous = tabsById.get(normalized.id)
    tabsById.set(normalized.id, {
      ...(previous ?? {}),
      ...normalized,
      id: normalized.id,
      name: normalized.name,
      path: normalized.path,
      language: normalized.language,
      role: normalized.role,
      lastModified: normalized.lastModified,
    })

    if (!orderedIds.includes(normalized.id)) {
      orderedIds.push(normalized.id)
    }

    if (normalized.isActive) {
      activeTabId = normalized.id
    }

    const resolvedActiveTabId = getActiveTabId()
    for (const tabId of orderedIds) {
      const tabEntry = tabsById.get(tabId)
      tabEntry.isActive = tabId === resolvedActiveTabId
    }

    emit(emitReason)
    return getTab(normalized.id)
  }

  const setActiveTab = (tabId, { emitReason = 'setActiveTab' } = {}) => {
    const id = toNonEmptyString(tabId)

    if (!id || !tabsById.has(id)) {
      return false
    }

    if (activeTabId === id) {
      return false
    }

    activeTabId = id

    for (const key of orderedIds) {
      const tab = tabsById.get(key)
      tab.isActive = key === id
    }

    emit(emitReason)
    return true
  }

  const removeTab = (tabId, { emitReason = 'removeTab' } = {}) => {
    const id = toNonEmptyString(tabId)
    if (!id || !tabsById.has(id) || orderedIds.length <= 1) {
      return false
    }

    const removedIndex = orderedIds.indexOf(id)
    tabsById.delete(id)
    if (removedIndex >= 0) {
      orderedIds.splice(removedIndex, 1)
    }

    if (activeTabId === id) {
      if (orderedIds.length === 0) {
        activeTabId = ''
      } else {
        const fallbackIndex = Math.min(Math.max(removedIndex, 0), orderedIds.length - 1)
        activeTabId = orderedIds[fallbackIndex] || orderedIds[0] || ''
      }
    }

    const resolvedActiveTabId = getActiveTabId()
    for (const key of orderedIds) {
      const tab = tabsById.get(key)
      tab.isActive = key === resolvedActiveTabId
    }

    emit(emitReason)
    return true
  }

  replaceTabs({
    nextTabs: tabs,
    nextActiveTabId: activeTabId,
    emitReason: 'init',
  })

  return {
    getTabs,
    getTab,
    getActiveTabId,
    replaceTabs: ({ tabs: nextTabs, activeTabId: nextActiveTabId } = {}) =>
      replaceTabs({
        nextTabs: Array.isArray(nextTabs) ? nextTabs : [],
        nextActiveTabId,
      }),
    upsertTab,
    setActiveTab,
    removeTab,
  }
}
