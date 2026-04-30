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
  getActiveTabId,
  getCurrentEditorSource,
  setCurrentEditorSource,
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
    const activeTabIdBeforeUpdate = workspaceTabsState.getActiveTabId()
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
      workspaceTabsState.replaceTabs({
        tabs: nextTabs,
        activeTabId: activeTabIdBeforeUpdate,
      })
    }

    const resolvedActiveTabId =
      typeof getActiveTabId === 'function'
        ? getActiveTabId()
        : workspaceTabsState.getActiveTabId() || activeTabIdBeforeUpdate
    const nextActiveEditorSource = resolvedActiveTabId
      ? updatedContentByTabId.get(resolvedActiveTabId)
      : null
    const currentEditorSource =
      typeof getCurrentEditorSource === 'function' ? getCurrentEditorSource() : null

    if (
      typeof nextActiveEditorSource === 'string' &&
      typeof currentEditorSource === 'string' &&
      nextActiveEditorSource !== currentEditorSource &&
      typeof setCurrentEditorSource === 'function'
    ) {
      setSuppressEditorChangeSideEffects(true)
      try {
        setCurrentEditorSource(nextActiveEditorSource)
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
