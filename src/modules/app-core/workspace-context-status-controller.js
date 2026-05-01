const isValidationLoadingPlaceholder = placeholderLabel =>
  typeof placeholderLabel === 'string' &&
  placeholderLabel.trim().toLowerCase() === 'loading writable repositories...'

const hasTokenValue = token => typeof token === 'string' && token.trim().length > 0

const createWorkspaceContextStatusController = ({
  statusNode,
  toNonEmptyWorkspaceText,
  getWorkspacePrTitle,
  getWorkspaceHeadBranch,
  getWorkspaceScopeMarker,
  getActiveWorkspaceRecordId,
  getWorkspaceRepositoryFullName,
  getSelectedRepositoryFullName,
}) => {
  let hasValidatedGitHubPat = false
  const appGrid =
    statusNode instanceof HTMLElement ? statusNode.closest('.app-grid') : null

  const getWorkspaceName = () => {
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

    if (appGrid instanceof HTMLElement) {
      appGrid.classList.toggle(
        'app-grid--workspace-context-visible',
        hasValidatedGitHubPat,
      )
    }

    statusNode.toggleAttribute('hidden', !hasValidatedGitHubPat)
    if (!hasValidatedGitHubPat) {
      return
    }

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
    if (!hasTokenValue(token)) {
      hasValidatedGitHubPat = false
    }

    render()
  }

  const syncWritableRepositoriesState = ({ token, placeholderLabel }) => {
    if (hasTokenValue(token) && !isValidationLoadingPlaceholder(placeholderLabel)) {
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
