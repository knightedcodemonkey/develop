const createWorkspaceSyncController = ({
  workspaceTabsState,
  getTabKind,
  getTabTargetPrFilePath,
  normalizeWorkspacePathValue,
  toWorkspaceSyncedContent,
  toWorkspaceSyncSha,
  toNonEmptyWorkspaceText,
  hasTabCommittedSyncState,
  getJsxSource,
  getCssSource,
  getWorkspaceTabByKind,
  queueWorkspaceSave,
  resolveWorkspaceRecordIdentity,
  getWorkspaceContextSnapshot,
  getActiveWorkspaceRecordId,
  getActiveWorkspaceCreatedAt,
  getRenderModeValue,
  normalizeRenderMode,
}) => {
  const buildWorkspaceTabsSnapshot = () => {
    const activeTabId = workspaceTabsState.getActiveTabId()
    return workspaceTabsState.getTabs().map(tab => {
      const currentPath = toNonEmptyWorkspaceText(tab.path)
      const isPrimaryEditorTab = tab?.id === 'component' || tab?.id === 'styles'

      const currentContent =
        tab.id === activeTabId
          ? getTabKind(tab) === 'styles'
            ? getCssSource()
            : getJsxSource()
          : typeof tab.content === 'string'
            ? tab.content
            : ''

      const normalizedPath = normalizeWorkspacePathValue(currentPath)
      const targetPrFilePath = isPrimaryEditorTab
        ? normalizedPath || null
        : normalizedPath || getTabTargetPrFilePath(tab) || null

      return {
        ...tab,
        path: currentPath,
        content: currentContent,
        syncedContent: toWorkspaceSyncedContent(tab?.syncedContent),
        targetPrFilePath,
        isActive: activeTabId === tab.id,
        lastModified: Date.now(),
      }
    })
  }

  const reconcileWorkspaceTabsWithPushUpdates = fileUpdates => {
    const updates = Array.isArray(fileUpdates) ? fileUpdates : []
    if (updates.length === 0) {
      return 0
    }

    const updatesByPath = new Map()
    for (const update of updates) {
      const normalizedPath = normalizeWorkspacePathValue(update?.path)
      if (!normalizedPath) {
        continue
      }

      updatesByPath.set(normalizedPath, toWorkspaceSyncSha(update?.commitSha))
    }

    if (updatesByPath.size === 0) {
      return 0
    }

    const now = Date.now()
    let updatedTabCount = 0
    const activeTabId = workspaceTabsState.getActiveTabId()
    const nextTabs = workspaceTabsState.getTabs().map(tab => {
      const isPrimaryEditorTab = tab?.id === 'component' || tab?.id === 'styles'
      const normalizedPath = normalizeWorkspacePathValue(tab.path)
      const candidatePaths = isPrimaryEditorTab
        ? [normalizedPath, getTabTargetPrFilePath(tab)].filter(Boolean)
        : [normalizedPath].filter(Boolean)

      const matchedPath = candidatePaths.find(path => updatesByPath.has(path))
      if (!matchedPath) {
        return tab
      }

      updatedTabCount += 1
      const commitSha = updatesByPath.get(matchedPath)

      return {
        ...tab,
        targetPrFilePath: normalizedPath || (isPrimaryEditorTab ? matchedPath : null),
        syncedContent: typeof tab?.content === 'string' ? tab.content : '',
        isDirty: false,
        syncedAt: now,
        lastSyncedRemoteSha: commitSha || toWorkspaceSyncSha(tab.lastSyncedRemoteSha),
        lastModified: now,
      }
    })

    if (updatedTabCount > 0) {
      workspaceTabsState.replaceTabs({
        tabs: nextTabs,
        activeTabId,
      })
      queueWorkspaceSave()
    }

    return updatedTabCount
  }

  const getWorkspacePrFileCommits = options => {
    const includeAllWorkspaceFiles =
      options?.includeAllWorkspaceFiles === true || options?.includeAll === true
    const snapshotTabs = buildWorkspaceTabsSnapshot()
    const dedupedByPath = new Map()
    const primaryTabPaths = new Set(
      snapshotTabs
        .filter(tab => tab?.id === 'component' || tab?.id === 'styles')
        .map(tab => normalizeWorkspacePathValue(tab?.path))
        .filter(Boolean),
    )

    for (const tab of snapshotTabs) {
      const shouldCommitTab = includeAllWorkspaceFiles
        ? true
        : Boolean(tab?.isDirty) || !hasTabCommittedSyncState(tab)
      if (!shouldCommitTab) {
        continue
      }

      const isPrimaryEditorTab = tab?.id === 'component' || tab?.id === 'styles'
      const normalizedPath = normalizeWorkspacePathValue(tab?.path)
      const path = normalizedPath || getTabTargetPrFilePath(tab) || ''
      if (!path) {
        continue
      }

      if (!isPrimaryEditorTab && primaryTabPaths.has(path)) {
        continue
      }

      dedupedByPath.set(path, {
        path,
        content: typeof tab?.content === 'string' ? tab.content : '',
        tabLabel: toNonEmptyWorkspaceText(tab?.name) || toNonEmptyWorkspaceText(tab?.id),
        isEntry: tab?.role === 'entry',
      })
    }

    return [...dedupedByPath.values()]
  }

  const getEditorSyncTargets = () => {
    const tabTargets = []
    const primaryTabIdByKind = {
      component: 'component',
      styles: 'styles',
    }

    for (const kind of ['component', 'styles']) {
      const primaryTabId = primaryTabIdByKind[kind]
      const tab = workspaceTabsState.getTab(primaryTabId) ?? getWorkspaceTabByKind(kind)
      const path =
        normalizeWorkspacePathValue(tab?.path) || getTabTargetPrFilePath(tab) || ''

      if (!path) {
        continue
      }

      tabTargets.push({ kind, path })
    }

    return { tabTargets }
  }

  const reconcileWorkspaceTabsWithEditorSync = ({ tabTargets } = {}) => {
    const targetsByKind = new Map()
    const normalizedTargets = Array.isArray(tabTargets) ? tabTargets : []

    for (const target of normalizedTargets) {
      const kind = toNonEmptyWorkspaceText(target?.kind)
      const normalizedPath = normalizeWorkspacePathValue(target?.path)
      if (!kind || !normalizedPath) {
        continue
      }

      targetsByKind.set(kind, normalizedPath)
    }

    if (targetsByKind.size === 0) {
      return 0
    }

    const now = Date.now()
    let updatedTabCount = 0
    const activeTabId = workspaceTabsState.getActiveTabId()
    const componentSource = getJsxSource()
    const stylesSource = getCssSource()

    const nextTabs = workspaceTabsState.getTabs().map(tab => {
      const isPrimaryEditorTab = tab?.id === 'component' || tab?.id === 'styles'
      if (!isPrimaryEditorTab) {
        return tab
      }

      const tabKind = getTabKind(tab)
      const expectedPath = targetsByKind.get(tabKind)
      if (!expectedPath) {
        return tab
      }

      const candidatePaths = [
        normalizeWorkspacePathValue(tab.path),
        getTabTargetPrFilePath(tab),
      ].filter(Boolean)
      const matchedPath = candidatePaths.find(path => path === expectedPath)
      if (!matchedPath) {
        return tab
      }

      const syncedContent = tabKind === 'styles' ? stylesSource : componentSource
      updatedTabCount += 1
      return {
        ...tab,
        targetPrFilePath: expectedPath,
        content: syncedContent,
        syncedContent,
        isDirty: false,
        syncedAt: now,
        lastModified: now,
      }
    })

    if (updatedTabCount > 0) {
      workspaceTabsState.replaceTabs({
        tabs: nextTabs,
        activeTabId,
      })
      queueWorkspaceSave()
    }

    return updatedTabCount
  }

  const buildWorkspaceRecordSnapshot = ({ recordId } = {}) => {
    const context = getWorkspaceContextSnapshot()
    const identity =
      typeof recordId === 'string' && recordId.length > 0
        ? {
            id: recordId,
            supersededId: '',
          }
        : resolveWorkspaceRecordIdentity({
            repositoryFullName: context.repositoryFullName,
            headBranch: context.headBranch,
            activeRecordId: getActiveWorkspaceRecordId(),
            prContextState: context.prContextState,
          })

    return {
      id: identity.id,
      supersededId: identity.supersededId,
      repo: context.repositoryFullName || '',
      base: context.baseBranch || '',
      head: context.headBranch || '',
      prNumber:
        typeof context.prNumber === 'number' && Number.isFinite(context.prNumber)
          ? context.prNumber
          : null,
      prTitle: context.prTitle || '',
      prContextState:
        typeof context.prContextState === 'string' && context.prContextState.trim()
          ? context.prContextState.trim()
          : 'inactive',
      renderMode: normalizeRenderMode(getRenderModeValue()),
      tabs: buildWorkspaceTabsSnapshot(),
      activeTabId: workspaceTabsState.getActiveTabId(),
      createdAt: getActiveWorkspaceCreatedAt() ?? Date.now(),
      lastModified: Date.now(),
    }
  }

  return {
    buildWorkspaceRecordSnapshot,
    buildWorkspaceTabsSnapshot,
    getEditorSyncTargets,
    getWorkspacePrFileCommits,
    reconcileWorkspaceTabsWithEditorSync,
    reconcileWorkspaceTabsWithPushUpdates,
  }
}

export { createWorkspaceSyncController }
