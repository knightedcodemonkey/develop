const createWorkspaceSyncController = ({
  workspaceTabsState,
  isStyleWorkspaceTab,
  getTabTargetPrFilePath,
  normalizeWorkspacePathValue,
  toWorkspaceSyncedContent,
  toWorkspaceSyncSha,
  toNonEmptyWorkspaceText,
  toWorkspaceRecordKey,
  hasTabCommittedSyncState,
  getJsxSource,
  getCssSource,
  queueWorkspaceSave,
  resolveWorkspaceRecordIdentity,
  getWorkspaceContextSnapshot,
  getWorkspaceScopeMarker,
  getActiveWorkspaceRecordId,
  getActiveWorkspaceCreatedAt,
  getRenderModeValue,
  normalizeRenderMode,
}) => {
  const removedWorkspaceTabPathsByWorkspaceKey = new Map()

  const getCurrentWorkspaceKey = () => {
    const context = getWorkspaceContextSnapshot()
    return toWorkspaceRecordKey({
      repositoryFullName: context?.repositoryFullName,
      headBranch: context?.headBranch,
    })
  }

  const getRemovedWorkspaceTabPathsForCurrentWorkspace = () => {
    const workspaceKey = getCurrentWorkspaceKey()
    if (!workspaceKey) {
      return new Set()
    }

    const trackedPaths = removedWorkspaceTabPathsByWorkspaceKey.get(workspaceKey)
    return trackedPaths instanceof Set ? trackedPaths : new Set()
  }

  const trackRemovedWorkspaceTab = tab => {
    if (!hasTabCommittedSyncState(tab)) {
      return false
    }

    const removedPath =
      getTabTargetPrFilePath(tab) || normalizeWorkspacePathValue(tab?.path) || ''
    if (!removedPath) {
      return false
    }

    const workspaceKey = getCurrentWorkspaceKey()
    if (!workspaceKey) {
      return false
    }

    const existingPaths = removedWorkspaceTabPathsByWorkspaceKey.get(workspaceKey)
    const nextPaths = existingPaths instanceof Set ? existingPaths : new Set()
    nextPaths.add(removedPath)
    removedWorkspaceTabPathsByWorkspaceKey.set(workspaceKey, nextPaths)
    return true
  }

  const clearTrackedRemovedWorkspaceTabPath = path => {
    const normalizedPath = normalizeWorkspacePathValue(path)
    if (!normalizedPath) {
      return false
    }

    const workspaceKey = getCurrentWorkspaceKey()
    if (!workspaceKey) {
      return false
    }

    const trackedPaths = removedWorkspaceTabPathsByWorkspaceKey.get(workspaceKey)
    if (!(trackedPaths instanceof Set) || !trackedPaths.has(normalizedPath)) {
      return false
    }

    trackedPaths.delete(normalizedPath)
    if (trackedPaths.size === 0) {
      removedWorkspaceTabPathsByWorkspaceKey.delete(workspaceKey)
    }

    return true
  }

  const resolveCanonicalDirtyState = ({ tab, content }) => {
    const syncedContent = toWorkspaceSyncedContent(tab?.syncedContent)
    if (syncedContent !== null) {
      return content !== syncedContent
    }

    return Boolean(tab?.isDirty)
  }

  const buildWorkspaceTabsSnapshot = () => {
    const activeTabId = workspaceTabsState.getActiveTabId()
    return workspaceTabsState.getTabs().map(tab => {
      const currentPath = toNonEmptyWorkspaceText(tab.path)

      const currentContent =
        tab.id === activeTabId
          ? isStyleWorkspaceTab(tab)
            ? getCssSource()
            : getJsxSource()
          : typeof tab.content === 'string'
            ? tab.content
            : ''

      const normalizedPath = normalizeWorkspacePathValue(currentPath)
      const targetPrFilePath = normalizedPath || getTabTargetPrFilePath(tab) || null
      const canonicalDirtyState = resolveCanonicalDirtyState({
        tab,
        content: currentContent,
      })

      return {
        ...tab,
        path: currentPath,
        content: currentContent,
        syncedContent: toWorkspaceSyncedContent(tab?.syncedContent),
        isDirty: canonicalDirtyState,
        targetPrFilePath,
        isActive: activeTabId === tab.id,
        lastModified: Date.now(),
      }
    })
  }

  const reconcileWorkspaceTabsWithPushUpdates = fileUpdates => {
    const updates = Array.isArray(fileUpdates) ? fileUpdates : []
    for (const update of updates) {
      if (update?.deleted === true) {
        clearTrackedRemovedWorkspaceTabPath(update?.path)
      }
    }

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
      const normalizedPath = normalizeWorkspacePathValue(tab.path)
      const candidatePaths = [normalizedPath, getTabTargetPrFilePath(tab)].filter(Boolean)

      const matchedPath = candidatePaths.find(path => updatesByPath.has(path))
      if (!matchedPath) {
        return tab
      }

      updatedTabCount += 1
      const commitSha = updatesByPath.get(matchedPath)

      return {
        ...tab,
        targetPrFilePath: normalizedPath || matchedPath,
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
    const sourceTabs = workspaceTabsState.getTabs()
    const sourceTabById = new Map(sourceTabs.map(tab => [tab?.id, tab]))
    const snapshotTabs = buildWorkspaceTabsSnapshot()
    const dedupedByPath = new Map()
    const currentPaths = new Set(
      snapshotTabs.map(tab => normalizeWorkspacePathValue(tab?.path)).filter(Boolean),
    )

    for (const tab of snapshotTabs) {
      const shouldCommitTab = includeAllWorkspaceFiles
        ? true
        : Boolean(tab?.isDirty) || !hasTabCommittedSyncState(tab)
      if (!shouldCommitTab) {
        continue
      }

      const normalizedPath = normalizeWorkspacePathValue(tab?.path)
      const path = normalizedPath || getTabTargetPrFilePath(tab) || ''
      if (!path) {
        continue
      }

      dedupedByPath.set(path, {
        path,
        content: typeof tab?.content === 'string' ? tab.content : '',
        tabLabel: toNonEmptyWorkspaceText(tab?.name) || toNonEmptyWorkspaceText(tab?.id),
        isEntry: tab?.role === 'entry',
      })

      const sourceTab = sourceTabById.get(tab?.id) ?? tab
      const previousPath = getTabTargetPrFilePath(sourceTab)
      const isCommittedRename =
        hasTabCommittedSyncState(sourceTab) &&
        Boolean(previousPath) &&
        Boolean(normalizedPath) &&
        previousPath !== normalizedPath

      if (
        !includeAllWorkspaceFiles &&
        isCommittedRename &&
        !currentPaths.has(previousPath) &&
        !dedupedByPath.has(previousPath)
      ) {
        dedupedByPath.set(previousPath, {
          path: previousPath,
          content: '',
          tabLabel:
            toNonEmptyWorkspaceText(tab?.name) || toNonEmptyWorkspaceText(tab?.id),
          isEntry: false,
          deleted: true,
        })
      }
    }

    if (!includeAllWorkspaceFiles) {
      const removedPaths = getRemovedWorkspaceTabPathsForCurrentWorkspace()
      for (const removedPath of removedPaths) {
        if (currentPaths.has(removedPath) || dedupedByPath.has(removedPath)) {
          continue
        }

        dedupedByPath.set(removedPath, {
          path: removedPath,
          content: '',
          tabLabel: removedPath,
          isEntry: false,
          deleted: true,
        })
      }
    }

    return [...dedupedByPath.values()]
  }

  const getEditorSyncTargets = () => {
    const dedupedByPath = new Map()
    const snapshotTabs = buildWorkspaceTabsSnapshot()

    for (const tab of snapshotTabs) {
      const path =
        normalizeWorkspacePathValue(tab?.path) || getTabTargetPrFilePath(tab) || ''
      if (!path) {
        continue
      }

      dedupedByPath.set(path, {
        path,
        kind: isStyleWorkspaceTab(tab) ? 'styles' : 'component',
        tabId: toNonEmptyWorkspaceText(tab?.id),
      })
    }

    const tabTargets = [...dedupedByPath.values()]

    return { tabTargets }
  }

  const reconcileWorkspaceTabsWithEditorSync = ({ tabTargets } = {}) => {
    const targetContentByPath = new Map()
    const normalizedTargets = Array.isArray(tabTargets) ? tabTargets : []

    for (const target of normalizedTargets) {
      const normalizedPath = normalizeWorkspacePathValue(target?.path)
      const content = typeof target?.content === 'string' ? target.content : null
      if (!normalizedPath || content === null) {
        continue
      }

      targetContentByPath.set(normalizedPath, content)
    }

    if (targetContentByPath.size === 0) {
      return 0
    }

    const now = Date.now()
    let updatedTabCount = 0
    const activeTabId = workspaceTabsState.getActiveTabId()

    const nextTabs = workspaceTabsState.getTabs().map(tab => {
      const candidatePaths = [
        normalizeWorkspacePathValue(tab.path),
        getTabTargetPrFilePath(tab),
      ].filter(Boolean)
      const matchedPath = candidatePaths.find(path => targetContentByPath.has(path))
      if (!matchedPath) {
        return tab
      }

      const syncedContent = targetContentByPath.get(matchedPath)
      if (typeof syncedContent !== 'string') {
        return tab
      }

      updatedTabCount += 1
      return {
        ...tab,
        targetPrFilePath: matchedPath,
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
            activeRecordId: getActiveWorkspaceRecordId(),
          })

    const normalizedPrTitle =
      typeof context.prTitle === 'string' ? context.prTitle.trim() : ''
    const requestedPrContextState =
      typeof context.prContextState === 'string' && context.prContextState.trim()
        ? context.prContextState.trim()
        : 'inactive'

    const requestedWorkspaceScope =
      typeof getWorkspaceScopeMarker === 'function'
        ? getWorkspaceScopeMarker()
        : context.repositoryFullName
          ? 'repository'
          : 'local'
    const normalizedWorkspaceScope =
      requestedWorkspaceScope === 'repository' ? 'repository' : 'local'

    return {
      id: identity.id,
      supersededId: identity.supersededId,
      workspaceScope: normalizedWorkspaceScope,
      workspaceKey: toWorkspaceRecordKey({
        repositoryFullName: context.repositoryFullName,
        headBranch: context.headBranch,
      }),
      repo: context.repositoryFullName || '',
      base: context.baseBranch || '',
      head: context.headBranch || '',
      prNumber:
        typeof context.prNumber === 'number' && Number.isFinite(context.prNumber)
          ? context.prNumber
          : null,
      prTitle: normalizedPrTitle,
      prContextState: requestedPrContextState,
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
    trackRemovedWorkspaceTab,
    reconcileWorkspaceTabsWithEditorSync,
    reconcileWorkspaceTabsWithPushUpdates,
  }
}

export { createWorkspaceSyncController }
