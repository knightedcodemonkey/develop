const createEnsureWorkspaceTabsShape =
  ({
    defaultComponentTabName,
    defaultComponentTabPath,
    defaultJsx,
    normalizeEntryTabPath,
    getAllowedEntryTabFileNames,
    getPathFileName,
    getTabTargetPrFilePath,
    normalizeWorkspacePathValue,
    toWorkspaceSyncTimestamp,
    toWorkspaceSyncSha,
    resolveSyncedBaselineContent,
    toNonEmptyWorkspaceText,
    isStyleTabLanguage,
  }) =>
  (tabs, { renderMode } = {}) => {
    const inputTabs = Array.isArray(tabs) ? tabs : []
    const hasEntryTab = inputTabs.some(tab => tab?.role === 'entry')
    const nextTabs = [...inputTabs]
    const allowedEntryTabFileNames =
      typeof getAllowedEntryTabFileNames === 'function'
        ? getAllowedEntryTabFileNames({ renderMode })
        : undefined

    if (!hasEntryTab) {
      nextTabs.unshift({
        id: 'entry',
        name: defaultComponentTabName,
        path: defaultComponentTabPath,
        language: 'javascript-jsx',
        role: 'entry',
        content: defaultJsx,
        isActive: true,
      })
    }

    return nextTabs.map(tab => {
      if (tab?.role === 'entry') {
        const normalizedEntryPath = normalizeEntryTabPath(tab.path, {
          preferredFileName: tab.name,
          allowedEntryTabFileNames,
        })
        const normalizedEntryTargetPath = normalizeWorkspacePathValue(normalizedEntryPath)
        return {
          ...tab,
          role: 'entry',
          language: 'javascript-jsx',
          content: typeof tab?.content === 'string' ? tab.content : '',
          path: normalizedEntryPath,
          name: getPathFileName(normalizedEntryPath) || defaultComponentTabName,
          targetPrFilePath: normalizedEntryTargetPath || null,
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
      const normalizedModulePath = nextPath
      const normalizedModuleTargetPath = normalizeWorkspacePathValue(nextPath)
      const nextContent = typeof tab?.content === 'string' ? tab.content : ''
      const normalizedNameInput = toNonEmptyWorkspaceText(tab?.name)
      const normalizedLanguage = isStyleTabLanguage(tab?.language)
        ? tab.language
        : 'javascript-jsx'
      return {
        ...tab,
        role: 'module',
        language: normalizedLanguage,
        path: normalizedModulePath,
        content: nextContent,
        name:
          normalizedNameInput ||
          getPathFileName(normalizedModulePath) ||
          toNonEmptyWorkspaceText(tab?.id),
        targetPrFilePath:
          normalizedModuleTargetPath || getTabTargetPrFilePath(tab) || null,
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
