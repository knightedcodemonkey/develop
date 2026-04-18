const toContentWithTrailingNewline = value => {
  if (typeof value !== 'string' || value.length === 0 || value.endsWith('\n')) {
    return value
  }

  return `${value}\n`
}

const createPublishTrailingNewlineNormalizer = ({
  workspaceTabsState,
  getLoadedTabIds,
  getJsxSource,
  getCssSource,
  setJsxSource,
  setCssSource,
  setSuppressEditorChangeSideEffects,
  queueWorkspaceSave,
}) => {
  return () => {
    const tabs = workspaceTabsState.getTabs()
    const activeTabId = workspaceTabsState.getActiveTabId()
    const loadedTabIds = new Set(
      (Array.isArray(getLoadedTabIds?.()) ? getLoadedTabIds() : []).filter(Boolean),
    )
    const now = Date.now()
    let didUpdateTabs = false

    const nextTabs = tabs.map(tab => {
      if (!loadedTabIds.has(tab?.id)) {
        return tab
      }

      const currentContent = typeof tab?.content === 'string' ? tab.content : ''
      const nextContent = toContentWithTrailingNewline(currentContent)
      if (nextContent === currentContent) {
        return tab
      }

      didUpdateTabs = true
      return {
        ...tab,
        content: nextContent,
        syncedContent: nextContent,
        isDirty: false,
        lastModified: now,
      }
    })

    if (didUpdateTabs) {
      workspaceTabsState.replaceTabs({ tabs: nextTabs, activeTabId })
    }

    const nextJsxSource = toContentWithTrailingNewline(getJsxSource())
    if (nextJsxSource !== getJsxSource()) {
      setSuppressEditorChangeSideEffects(true)
      try {
        setJsxSource(nextJsxSource)
      } finally {
        setSuppressEditorChangeSideEffects(false)
      }
    }

    const nextCssSource = toContentWithTrailingNewline(getCssSource())
    if (nextCssSource !== getCssSource()) {
      setSuppressEditorChangeSideEffects(true)
      try {
        setCssSource(nextCssSource)
      } finally {
        setSuppressEditorChangeSideEffects(false)
      }
    }

    if (didUpdateTabs) {
      queueWorkspaceSave()
    }
  }
}

export { createPublishTrailingNewlineNormalizer }
