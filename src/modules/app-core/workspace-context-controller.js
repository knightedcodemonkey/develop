const createWorkspaceContextController = ({
  workspaceStorage,
  getCurrentSelectedRepository,
  getWorkspacesDrawerController,
  getActiveWorkspaceRecordId,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  setWorkspacePrContextState,
  setWorkspacePrNumber,
  setIsApplyingWorkspaceSnapshot,
  ensureWorkspaceTabsShape,
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrTitle,
  workspaceTabsState,
  resolveWorkspaceActiveTabId,
  normalizeRenderMode,
  getRenderModeValue,
  setRenderModeValue,
  persistRenderMode,
  onWorkspaceRecordApplied,
  getActiveWorkspaceTab,
  loadWorkspaceTabIntoEditor,
  renderWorkspaceTabs,
  updateRenderModeEditability,
  getHasCompletedInitialWorkspaceBootstrap,
  maybeRender,
  setStatus,
  toWorkspaceRecordKey,
  getHeadBranchValue,
}) => {
  const toWorkspacePrContextState = value =>
    typeof value === 'string' ? value.trim().toLowerCase() : ''

  const listLocalContextRecords = async ({ includeAllRepositories = true } = {}) => {
    if (includeAllRepositories) {
      return workspaceStorage.listWorkspaces()
    }

    const selectedRepository = getCurrentSelectedRepository()
    return workspaceStorage.listWorkspaces({
      repo: selectedRepository || '',
    })
  }

  const refreshLocalContextOptions = async ({ includeAllRepositories = true } = {}) => {
    const options = await listLocalContextRecords({ includeAllRepositories })
    const workspacesDrawerController = getWorkspacesDrawerController()

    if (workspacesDrawerController) {
      const isDrawerOpen = workspacesDrawerController.isOpen?.() === true
      if (!isDrawerOpen) {
        workspacesDrawerController.setSelectedId(getActiveWorkspaceRecordId())
      }

      await workspacesDrawerController.refresh()
    }

    return options
  }

  const applyWorkspaceRecord = async (workspace, { silent = false } = {}) => {
    if (!workspace || typeof workspace !== 'object') {
      return false
    }

    setIsApplyingWorkspaceSnapshot(true)

    try {
      setActiveWorkspaceRecordId(workspace.id)
      setActiveWorkspaceCreatedAt(workspace.createdAt ?? null)

      if (typeof setWorkspacePrContextState === 'function') {
        const nextPrContextState =
          typeof workspace.prContextState === 'string' && workspace.prContextState.trim()
            ? workspace.prContextState.trim()
            : 'inactive'
        setWorkspacePrContextState(nextPrContextState)
      }

      if (typeof setWorkspacePrNumber === 'function') {
        const nextPrNumber =
          typeof workspace.prNumber === 'number' && Number.isFinite(workspace.prNumber)
            ? workspace.prNumber
            : null
        setWorkspacePrNumber(nextPrNumber)
      }

      const nextTabs = ensureWorkspaceTabsShape(workspace.tabs)
      if (typeof workspace.base === 'string' && githubPrBaseBranch) {
        githubPrBaseBranch.value = workspace.base
      }

      if (typeof workspace.head === 'string' && githubPrHeadBranch) {
        githubPrHeadBranch.value = workspace.head
      }

      if (typeof workspace.prTitle === 'string' && githubPrTitle) {
        githubPrTitle.value = workspace.prTitle
      }

      workspaceTabsState.replaceTabs({
        tabs: nextTabs,
        activeTabId: resolveWorkspaceActiveTabId({
          tabs: nextTabs,
          requestedActiveTabId: workspace.activeTabId,
        }),
      })

      const nextRenderMode = normalizeRenderMode(workspace.renderMode)
      if (getRenderModeValue() !== nextRenderMode) {
        setRenderModeValue(nextRenderMode)
      }
      persistRenderMode(nextRenderMode)

      const activeTab = getActiveWorkspaceTab()
      if (activeTab) {
        loadWorkspaceTabIntoEditor(activeTab)
      }

      renderWorkspaceTabs()
      updateRenderModeEditability()

      if (getHasCompletedInitialWorkspaceBootstrap()) {
        maybeRender()
      }

      if (typeof onWorkspaceRecordApplied === 'function') {
        onWorkspaceRecordApplied(workspace, { silent })
      }

      await refreshLocalContextOptions()
      if (!silent) {
        setStatus('Loaded local workspace context.', 'neutral')
      }

      return true
    } finally {
      setIsApplyingWorkspaceSnapshot(false)
    }
  }

  const loadPreferredWorkspaceContext = async () => {
    const selectedRepository = getCurrentSelectedRepository()
    const options = await listLocalContextRecords({
      includeAllRepositories: !selectedRepository,
    })

    await refreshLocalContextOptions({ includeAllRepositories: true })

    if (!Array.isArray(options) || options.length === 0) {
      return
    }

    const activeWorkspaceRecordId = getActiveWorkspaceRecordId()
    const preferredById = activeWorkspaceRecordId
      ? options.find(workspace => workspace.id === activeWorkspaceRecordId)
      : null

    const preferredWorkspaceKey = toWorkspaceRecordKey({
      repositoryFullName: getCurrentSelectedRepository(),
      headBranch: getHeadBranchValue(),
    })

    const preferredByKey = options.find(workspace => {
      const candidateKey =
        typeof workspace?.workspaceKey === 'string' ? workspace.workspaceKey.trim() : ''
      return candidateKey === preferredWorkspaceKey
    })

    const preferred = preferredById ?? preferredByKey
    const preferredIsActive =
      toWorkspacePrContextState(preferred?.prContextState) === 'active'
    const activeContextOption = options.find(
      workspace => toWorkspacePrContextState(workspace?.prContextState) === 'active',
    )
    const next = preferredIsActive
      ? preferred
      : (activeContextOption ?? preferred ?? options[0])

    if (!next) {
      return
    }

    await applyWorkspaceRecord(next, { silent: true })
  }

  return {
    applyWorkspaceRecord,
    listLocalContextRecords,
    loadPreferredWorkspaceContext,
    refreshLocalContextOptions,
  }
}

export { createWorkspaceContextController }
