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
  parsePullRequestNumberFromUrl,
  readRepositoryPrConfig,
  saveRepositoryPrConfig,
  sanitizeRepositoryPrConfig,
  removeRepositoryPrConfig,
  sanitizeBranchPart,
  toSafeText,
}) => {
  return {
    disconnectActivePrContext: () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      if (!repositoryFullName) {
        return { reference: '' }
      }

      const savedConfig = readRepositoryPrConfig(repositoryFullName)
      const normalizedSavedConfig = sanitizeRepositoryPrConfig(savedConfig)
      const previousActiveContext =
        savedConfig?.isActivePr === true
          ? {
              repositoryFullName,
              pullRequestNumber:
                typeof savedConfig.pullRequestNumber === 'number' &&
                Number.isFinite(savedConfig.pullRequestNumber)
                  ? savedConfig.pullRequestNumber
                  : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl),
            }
          : null

      if (Object.keys(savedConfig).length > 0) {
        saveRepositoryPrConfig({
          repositoryFullName,
          config: {
            ...normalizedSavedConfig,
            isActivePr: false,
            prContextState: 'disconnected',
          },
        })
      }

      state.lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      setSubmitButtonLabel()
      emitActivePrContextChange()

      return {
        reference: formatActivePrReference(previousActiveContext),
        pullRequestNumber:
          typeof previousActiveContext?.pullRequestNumber === 'number' &&
          Number.isFinite(previousActiveContext.pullRequestNumber)
            ? previousActiveContext.pullRequestNumber
            : null,
      }
    },
    clearActivePrContext: () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      if (!repositoryFullName) {
        return
      }

      removeRepositoryPrConfig(repositoryFullName)
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
      const pullRequestNumber =
        activeContext?.pullRequestNumber ??
        parsePullRequestNumberFromUrl(activeContext?.pullRequestUrl)

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

      const savedConfig = sanitizeRepositoryPrConfig(
        readRepositoryPrConfig(repositoryFullName),
      )
      saveRepositoryPrConfig({
        repositoryFullName,
        config: {
          ...savedConfig,
          baseBranch: toSafeText(activeContext?.baseBranch) || savedConfig.baseBranch,
          headBranch:
            sanitizeBranchPart(activeContext?.headBranch) || savedConfig.headBranch,
          prTitle: toSafeText(activeContext?.prTitle) || savedConfig.prTitle,
          prBody:
            typeof activeContext?.prBody === 'string'
              ? activeContext.prBody
              : savedConfig.prBody,
          isActivePr: false,
          prContextState: 'closed',
          pullRequestNumber,
          pullRequestUrl:
            toSafeText(activeContext?.pullRequestUrl) || savedConfig.pullRequestUrl,
        },
      })
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
