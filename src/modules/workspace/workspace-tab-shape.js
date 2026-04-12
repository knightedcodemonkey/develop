const createEnsureWorkspaceTabsShape =
  ({
    defaultComponentTabName,
    defaultComponentTabPath,
    defaultStylesTabName,
    defaultStylesTabPath,
    defaultJsx,
    normalizeEntryTabPath,
    getPathFileName,
    getTabTargetPrFilePath,
    normalizeWorkspacePathValue,
    toWorkspaceSyncTimestamp,
    toWorkspaceSyncSha,
    resolveSyncedBaselineContent,
    toNonEmptyWorkspaceText,
    isStyleTabLanguage,
  }) =>
  tabs => {
    const inputTabs = Array.isArray(tabs) ? tabs : []
    const hasComponent = inputTabs.some(tab => tab?.id === 'component')
    const nextTabs = [...inputTabs]

    if (!hasComponent) {
      nextTabs.unshift({
        id: 'component',
        name: defaultComponentTabName,
        path: defaultComponentTabPath,
        language: 'javascript-jsx',
        role: 'entry',
        content: defaultJsx,
        isActive: true,
      })
    }

    return nextTabs.map(tab => {
      if (tab?.id === 'component') {
        const normalizedEntryPath = normalizeEntryTabPath(tab.path, {
          preferredFileName: tab.name,
        })
        return {
          ...tab,
          role: 'entry',
          language: 'javascript-jsx',
          content: typeof tab?.content === 'string' ? tab.content : '',
          path: normalizedEntryPath,
          name: getPathFileName(normalizedEntryPath) || defaultComponentTabName,
          targetPrFilePath:
            getTabTargetPrFilePath(tab) ||
            normalizeWorkspacePathValue(normalizedEntryPath),
          isDirty: Boolean(tab?.isDirty),
          syncedAt: toWorkspaceSyncTimestamp(tab?.syncedAt),
          lastSyncedRemoteSha: toWorkspaceSyncSha(tab?.lastSyncedRemoteSha),
          syncedContent: resolveSyncedBaselineContent({
            tab,
            content: typeof tab?.content === 'string' ? tab.content : '',
          }),
        }
      }

      if (tab?.id === 'styles') {
        const normalizedStylesPath =
          toNonEmptyWorkspaceText(tab.path) || defaultStylesTabPath
        const normalizedStylesNameInput = toNonEmptyWorkspaceText(tab.name)
        return {
          ...tab,
          language: isStyleTabLanguage(tab.language) ? tab.language : 'css',
          role: 'module',
          content: typeof tab?.content === 'string' ? tab.content : '',
          path: normalizedStylesPath,
          name:
            !normalizedStylesNameInput ||
            normalizedStylesNameInput.toLowerCase() === 'styles'
              ? getPathFileName(normalizedStylesPath) || defaultStylesTabName
              : normalizedStylesNameInput,
          targetPrFilePath:
            getTabTargetPrFilePath(tab) ||
            normalizeWorkspacePathValue(normalizedStylesPath),
          isDirty: Boolean(tab?.isDirty),
          syncedAt: toWorkspaceSyncTimestamp(tab?.syncedAt),
          lastSyncedRemoteSha: toWorkspaceSyncSha(tab?.lastSyncedRemoteSha),
          syncedContent: resolveSyncedBaselineContent({
            tab,
            content: typeof tab?.content === 'string' ? tab.content : '',
          }),
        }
      }

      const nextPath = toNonEmptyWorkspaceText(tab?.path)
      const nextContent = typeof tab?.content === 'string' ? tab.content : ''
      return {
        ...tab,
        role: 'module',
        language: isStyleTabLanguage(tab?.language) ? tab.language : 'javascript-jsx',
        path: nextPath,
        content: nextContent,
        name: toNonEmptyWorkspaceText(tab?.name) || getPathFileName(nextPath) || tab?.id,
        targetPrFilePath: getTabTargetPrFilePath(tab) || null,
        isDirty: Boolean(tab?.isDirty),
        syncedAt: toWorkspaceSyncTimestamp(tab?.syncedAt),
        lastSyncedRemoteSha: toWorkspaceSyncSha(tab?.lastSyncedRemoteSha),
        syncedContent: resolveSyncedBaselineContent({
          tab,
          content: nextContent,
        }),
      }
    })
  }

export { createEnsureWorkspaceTabsShape }
