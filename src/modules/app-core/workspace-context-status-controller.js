const hasTokenValue = token => typeof token === 'string' && token.trim().length > 0

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
  let hasValidatedGitHubPat = false
  let hasCompletedRepositoryLoad = false

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
    const shouldShowRepositoryContext =
      hasValidatedGitHubPat && workspaceScope !== 'local'
    const repository = shouldShowRepositoryContext
      ? toNonEmptyWorkspaceText(getWorkspaceRepositoryFullName?.()) ||
        toNonEmptyWorkspaceText(getSelectedRepositoryFullName?.()) ||
        'unknown'
      : 'local'

    statusNode.textContent = `${workspaceName} • ${repository}`
  }

  const renderForRepositoryChange = () => {
    render()
  }

  const syncTokenState = token => {
    if (!hasTokenValue(token)) {
      hasValidatedGitHubPat = false
      hasCompletedRepositoryLoad = false
    } else if (hasCompletedRepositoryLoad) {
      hasValidatedGitHubPat = true
    }

    render()
  }

  const syncWritableRepositoriesState = ({ token, isLoadingRepositories = false }) => {
    if (!isLoadingRepositories) {
      hasCompletedRepositoryLoad = true
    }

    if (hasTokenValue(token) && !isLoadingRepositories) {
      hasValidatedGitHubPat = true
    }

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
