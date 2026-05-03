const createWorkspaceContextStatusController = ({
  statusNode,
  toNonEmptyWorkspaceText,
  getWorkspacePrTitle,
  getWorkspaceHeadBranch,
  getActiveWorkspacePersistedPrTitle,
  getActiveWorkspacePersistedHeadBranch,
  getWorkspaceScopeMarker,
  getActiveWorkspaceRecordId,
  getWorkspaceRepositoryFullName,
  getSelectedRepositoryFullName,
}) => {
  const getWorkspaceName = () => {
    const workspaceScope =
      toNonEmptyWorkspaceText(getWorkspaceScopeMarker?.()).toLowerCase() || 'local'

    if (workspaceScope === 'local') {
      const persistedPrTitle = toNonEmptyWorkspaceText(
        getActiveWorkspacePersistedPrTitle?.(),
      )
      if (persistedPrTitle) {
        return persistedPrTitle
      }

      const persistedHeadBranch = toNonEmptyWorkspaceText(
        getActiveWorkspacePersistedHeadBranch?.(),
      )
      if (persistedHeadBranch) {
        return persistedHeadBranch
      }
    }

    const prTitle = toNonEmptyWorkspaceText(getWorkspacePrTitle?.())
    if (prTitle) {
      return prTitle
    }

    const headBranch = toNonEmptyWorkspaceText(getWorkspaceHeadBranch?.())
    if (headBranch) {
      return headBranch
    }

    return toNonEmptyWorkspaceText(getActiveWorkspaceRecordId?.()) || 'unknown'
  }

  const render = () => {
    if (!(statusNode instanceof HTMLElement)) {
      return
    }

    statusNode.removeAttribute('hidden')

    const workspaceName = getWorkspaceName()
    const workspaceScope =
      toNonEmptyWorkspaceText(getWorkspaceScopeMarker?.()).toLowerCase() || 'local'
    const repository =
      workspaceScope === 'local'
        ? 'local'
        : toNonEmptyWorkspaceText(getWorkspaceRepositoryFullName?.()) ||
          toNonEmptyWorkspaceText(getSelectedRepositoryFullName?.()) ||
          'unknown'

    statusNode.textContent = `${workspaceName} • ${repository}`
  }

  const renderForRepositoryChange = () => {
    render()
  }

  const syncTokenState = token => {
    void token
    render()
  }

  const syncWritableRepositoriesState = ({ token, isLoadingRepositories = false }) => {
    void token
    void isLoadingRepositories
    render()
  }

  return {
    render,
    renderForRepositoryChange,
    syncTokenState,
    syncWritableRepositoriesState,
  }
}

export { createWorkspaceContextStatusController }
