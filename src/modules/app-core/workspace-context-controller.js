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
  toWorkspaceRecordId,
  getHeadBranchValue,
}) => {
  const listLocalContextRecords = async () => {
    const selectedRepository = getCurrentSelectedRepository()
    return workspaceStorage.listWorkspaces({
      repo: selectedRepository || '',
    })
  }

  const refreshLocalContextOptions = async () => {
    const options = await listLocalContextRecords()
    const workspacesDrawerController = getWorkspacesDrawerController()

    if (workspacesDrawerController) {
      workspacesDrawerController.setSelectedId(getActiveWorkspaceRecordId())
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
        onWorkspaceRecordApplied(workspace)
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
    const options = await refreshLocalContextOptions()

    if (!Array.isArray(options) || options.length === 0) {
      return
    }

    const preferredId =
      getActiveWorkspaceRecordId() ||
      toWorkspaceRecordId({
        repositoryFullName: getCurrentSelectedRepository(),
        headBranch: getHeadBranchValue(),
      })

    const preferred = options.find(workspace => workspace.id === preferredId)
    const next = preferred ?? options[0]

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
