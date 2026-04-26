export const createPublicActions = ({
  state,
  toggleButton,
  getSelectedRepositoryObject,
  getRepositoryFullName,
  getToken,
  getCurrentActivePrContext,
  getFormValues,
  setStatus,
  setOpen,
  setSubmitButtonLabel,
  emitActivePrContextChange,
  syncFormForRepository,
  verifyActivePullRequestContext,
  loadBaseBranchesForSelectedRepository,
  renderBaseBranchOptions,
  syncRepositories,
  abortPendingBranchesRequest,
  abortPendingContextVerifyRequest,
  abortPendingActiveContentSyncRequest,
  closeRepositoryPullRequest,
  formatActivePrReference,
  clearRepositoryActivePrContext,
  toSafeText,
}) => {
  const clearSelectedRepositoryActivePrContext = ({ resetForm = false } = {}) => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    if (!repositoryFullName) {
      return false
    }

    clearRepositoryActivePrContext(repositoryFullName)
    state.lastActiveContentSyncKey = ''
    abortPendingActiveContentSyncRequest()

    if (resetForm) {
      syncFormForRepository({ resetAll: true, resetBranch: true })
    }

    setSubmitButtonLabel()
    emitActivePrContextChange()
    return true
  }

  return {
    clearActivePrContext: () => {
      clearSelectedRepositoryActivePrContext({ resetForm: true })
    },
    clearSelectedRepositoryActivePrContext,
    closeActivePullRequestOnGitHub: async () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      const token = toSafeText(getToken?.())
      const activeContext = getCurrentActivePrContext()
      const pullRequestNumber = activeContext?.pullRequestNumber

      if (!repositoryFullName || !repository?.owner || !repository?.name) {
        throw new Error('Select a repository before closing pull request context.')
      }

      if (!token) {
        throw new Error('Add a GitHub token before closing a pull request.')
      }

      if (!pullRequestNumber) {
        throw new Error('Active pull request context is missing pull request metadata.')
      }

      setStatus('Closing pull request on GitHub...', 'pending')

      await closeRepositoryPullRequest({
        token,
        owner: repository.owner,
        repo: repository.name,
        pullRequestNumber,
      })

      clearSelectedRepositoryActivePrContext({ resetForm: true })

      const closedReference = formatActivePrReference({
        repositoryFullName,
        pullRequestNumber,
      })
      setStatus(
        closedReference
          ? `Closed pull request ${closedReference}.`
          : `Closed pull request #${pullRequestNumber}.`,
        'ok',
      )

      return { pullRequestNumber, reference: closedReference }
    },
    setToken: token => {
      const hasToken = typeof token === 'string' && token.trim().length > 0
      if (toggleButton instanceof HTMLButtonElement) {
        toggleButton.disabled = !hasToken
      }

      setSubmitButtonLabel()
      emitActivePrContextChange()
      void verifyActivePullRequestContext()

      if (!hasToken) {
        abortPendingContextVerifyRequest()
        abortPendingActiveContentSyncRequest()
        state.lastActiveContentSyncKey = ''
        abortPendingBranchesRequest()
        state.baseBranchesByRepository.clear()
        setOpen(false)
        renderBaseBranchOptions({ preferredBranch: 'main', branchNames: [] })
        return
      }

      if (!state.open) {
        return
      }

      void loadBaseBranchesForSelectedRepository({
        preferredBranch: getFormValues().baseBranch,
      })
    },
    setSelectedRepository: () => {
      syncRepositories()
    },
    dispose: () => {
      state.pendingAbortController?.abort()
      state.pendingAbortController = null
      abortPendingContextVerifyRequest()
      abortPendingActiveContentSyncRequest()
      abortPendingBranchesRequest()
    },
  }
}
