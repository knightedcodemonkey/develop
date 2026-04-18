const toContentWithTrailingNewline = value => {
  if (typeof value !== 'string' || value.length === 0 || value.endsWith('\n')) {
    return value
  }

  return `${value}\n`
}

const createPublishTrailingNewlineNormalizer = ({
  workspaceTabsState,
  getTabPublishPath,
  normalizePublishPath,
  getLoadedComponentTabId,
  getLoadedStylesTabId,
  getJsxSource,
  getCssSource,
  setJsxSource,
  setCssSource,
  setSuppressEditorChangeSideEffects,
  queueWorkspaceSave,
}) => {
  return ({ fileUpdates } = {}) => {
    const normalizedFileUpdates = Array.isArray(fileUpdates) ? fileUpdates : []
    const publishedPaths = new Set(
      normalizedFileUpdates
        .map(update => {
          const path = typeof update?.path === 'string' ? update.path : ''
          return typeof normalizePublishPath === 'function'
            ? normalizePublishPath(path)
            : path.trim()
        })
        .filter(Boolean),
    )

    if (publishedPaths.size === 0) {
      return
    }

    const tabs = workspaceTabsState.getTabs()
    const activeTabId = workspaceTabsState.getActiveTabId()
    const now = Date.now()
    let didUpdateTabs = false
    const updatedContentByTabId = new Map()

    const nextTabs = tabs.map(tab => {
      const publishPath =
        typeof getTabPublishPath === 'function' ? getTabPublishPath(tab) : ''
      if (!publishPath || !publishedPaths.has(publishPath)) {
        return tab
      }

      const currentContent = typeof tab?.content === 'string' ? tab.content : ''
      const nextContent = toContentWithTrailingNewline(currentContent)
      if (nextContent === currentContent) {
        return tab
      }

      didUpdateTabs = true
      updatedContentByTabId.set(tab.id, nextContent)
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

    const loadedComponentTabId =
      typeof getLoadedComponentTabId === 'function' ? getLoadedComponentTabId() : ''
    const nextJsxSource = loadedComponentTabId
      ? updatedContentByTabId.get(loadedComponentTabId)
      : null
    if (typeof nextJsxSource === 'string' && nextJsxSource !== getJsxSource()) {
      setSuppressEditorChangeSideEffects(true)
      try {
        setJsxSource(nextJsxSource)
      } finally {
        setSuppressEditorChangeSideEffects(false)
      }
    }

    const loadedStylesTabId =
      typeof getLoadedStylesTabId === 'function' ? getLoadedStylesTabId() : ''
    const nextCssSource = loadedStylesTabId
      ? updatedContentByTabId.get(loadedStylesTabId)
      : null
    if (typeof nextCssSource === 'string' && nextCssSource !== getCssSource()) {
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
