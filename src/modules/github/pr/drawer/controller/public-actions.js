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
  return {
    disconnectActivePrContext: () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      if (!repositoryFullName) {
        return { reference: '' }
      }

      const activeContext = getCurrentActivePrContext()
      clearRepositoryActivePrContext(repositoryFullName)

      state.lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      setSubmitButtonLabel()
      emitActivePrContextChange()

      return {
        reference: formatActivePrReference(activeContext),
        pullRequestNumber:
          typeof activeContext?.pullRequestNumber === 'number' &&
          Number.isFinite(activeContext.pullRequestNumber)
            ? activeContext.pullRequestNumber
            : null,
      }
    },
    clearActivePrContext: () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      if (!repositoryFullName) {
        return
      }

      clearRepositoryActivePrContext(repositoryFullName)
      state.lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      syncFormForRepository({ resetAll: true, resetBranch: true })
      setSubmitButtonLabel()
      emitActivePrContextChange()
    },
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

      clearRepositoryActivePrContext(repositoryFullName)
      syncFormForRepository({ resetAll: true, resetBranch: true })
      setSubmitButtonLabel()
      emitActivePrContextChange()

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
