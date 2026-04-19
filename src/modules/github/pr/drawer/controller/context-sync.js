export const createContextSyncHandlers = ({
  state,
  getSelectedRepositoryObject,
  getRepositoryFullName,
  getToken,
  getEditorSyncTargets,
  onSyncActivePrEditorContent,
  getCurrentActivePrContext,
  syncFormForRepository,
  setSubmitButtonLabel,
  emitActivePrContextChange,
  setStatus,
  toSafeText,
  sanitizeBranchPart,
  parsePullRequestNumberFromUrl,
  readRepositoryPrConfig,
  saveRepositoryPrConfig,
  sanitizeRepositoryPrConfig,
  getRepositoryPullRequest,
  findOpenRepositoryPullRequestByHead,
}) => {
  const abortPendingContextVerifyRequest = () => {
    state.pendingContextVerifyAbortController?.abort()
    state.pendingContextVerifyAbortController = null
    state.pendingContextVerifyRequestKey = ''
    state.pendingContextVerifyPromise = null
  }

  const abortPendingActiveContentSyncRequest = () => {
    state.pendingActiveContentSyncAbortController?.abort()
    state.pendingActiveContentSyncAbortController = null
  }

  const syncActivePrEditorContent = async () => {
    if (typeof onSyncActivePrEditorContent !== 'function') {
      return
    }

    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    const token = toSafeText(getToken?.())
    const activeContext = getCurrentActivePrContext()

    if (!repositoryFullName || !token || !activeContext) {
      state.lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      return
    }

    const syncTargets =
      typeof getEditorSyncTargets === 'function' ? getEditorSyncTargets() : null
    const tabSyncTargets = Array.isArray(syncTargets?.tabTargets)
      ? syncTargets.tabTargets
      : []
    const componentSyncPath = toSafeText(
      tabSyncTargets.find(target => toSafeText(target?.kind) === 'component')?.path,
    )
    const stylesSyncPath = toSafeText(
      tabSyncTargets.find(target => toSafeText(target?.kind) === 'styles')?.path,
    )

    if (!componentSyncPath || !stylesSyncPath) {
      state.lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      return
    }

    const syncKey = [
      repositoryFullName,
      activeContext.headBranch,
      componentSyncPath,
      stylesSyncPath,
      String(activeContext.pullRequestNumber ?? ''),
    ].join('|')

    if (syncKey === state.lastActiveContentSyncKey) {
      return
    }

    abortPendingActiveContentSyncRequest()
    const abortController = new AbortController()
    state.pendingActiveContentSyncAbortController = abortController

    try {
      await onSyncActivePrEditorContent({
        token,
        repository,
        activeContext,
        syncTargets: {
          tabTargets: [
            { kind: 'component', path: componentSyncPath },
            { kind: 'styles', path: stylesSyncPath },
          ],
        },
        signal: abortController.signal,
      })

      if (state.pendingActiveContentSyncAbortController !== abortController) {
        return
      }

      state.lastActiveContentSyncKey = syncKey
    } catch {
      if (abortController.signal.aborted) {
        return
      }
    } finally {
      if (state.pendingActiveContentSyncAbortController === abortController) {
        state.pendingActiveContentSyncAbortController = null
      }
    }
  }

  const verifyActivePullRequestContext = async () => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    const owner = toSafeText(repository?.owner)
    const repo = toSafeText(repository?.name)
    const token = toSafeText(getToken?.())

    if (!repositoryFullName || !owner || !repo || !token) {
      return
    }

    const savedConfig = readRepositoryPrConfig(repositoryFullName)
    if (savedConfig?.isActivePr !== true) {
      return
    }

    const pullRequestNumberFromConfig =
      typeof savedConfig.pullRequestNumber === 'number' &&
      Number.isFinite(savedConfig.pullRequestNumber)
        ? savedConfig.pullRequestNumber
        : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl)
    const headBranch = sanitizeBranchPart(savedConfig.headBranch)

    if (!pullRequestNumberFromConfig && !headBranch) {
      return
    }

    const requestKey = [
      repositoryFullName,
      String(pullRequestNumberFromConfig || ''),
      headBranch,
      toSafeText(savedConfig.baseBranch),
    ].join('|')

    if (
      state.pendingContextVerifyPromise &&
      state.pendingContextVerifyRequestKey === requestKey
    ) {
      await state.pendingContextVerifyPromise
      return
    }

    abortPendingContextVerifyRequest()
    const abortController = new AbortController()
    state.pendingContextVerifyAbortController = abortController

    const runVerifyRequest = async () => {
      try {
        let resolvedPullRequest = null
        let pullRequestClosedByNumber = false

        if (pullRequestNumberFromConfig) {
          const pullRequest = await getRepositoryPullRequest({
            token,
            owner,
            repo,
            pullRequestNumber: pullRequestNumberFromConfig,
            signal: abortController.signal,
          })

          if (pullRequest?.isOpen) {
            resolvedPullRequest = pullRequest
          } else if (pullRequest) {
            pullRequestClosedByNumber = true
          }
        }

        if (!resolvedPullRequest && !pullRequestClosedByNumber) {
          resolvedPullRequest = await findOpenRepositoryPullRequestByHead({
            token,
            owner,
            repo,
            headOwner: owner,
            headBranch,
            baseBranch: toSafeText(savedConfig.baseBranch),
            signal: abortController.signal,
          })
        }

        if (state.pendingContextVerifyAbortController !== abortController) {
          return
        }

        if (resolvedPullRequest?.isOpen) {
          const normalizedSavedConfig = sanitizeRepositoryPrConfig(savedConfig)
          const nextHeadBranch =
            sanitizeBranchPart(resolvedPullRequest.headRef) || headBranch
          const nextBaseBranch =
            toSafeText(resolvedPullRequest.baseRef) || toSafeText(savedConfig.baseBranch)

          saveRepositoryPrConfig({
            repositoryFullName,
            config: {
              ...normalizedSavedConfig,
              isActivePr: true,
              prContextState: 'active',
              headBranch: nextHeadBranch,
              baseBranch: nextBaseBranch,
              pullRequestNumber: resolvedPullRequest.number,
              pullRequestUrl: resolvedPullRequest.htmlUrl,
              prTitle:
                toSafeText(savedConfig.prTitle) || toSafeText(resolvedPullRequest.title),
            },
          })
          syncFormForRepository({ resetBranch: true })
          setSubmitButtonLabel()
          emitActivePrContextChange()
          void syncActivePrEditorContent()
          return
        }

        saveRepositoryPrConfig({
          repositoryFullName,
          config: {
            ...sanitizeRepositoryPrConfig(savedConfig),
            isActivePr: false,
            prContextState: 'closed',
          },
        })
        setSubmitButtonLabel()
        emitActivePrContextChange()
        state.lastActiveContentSyncKey = ''
        abortPendingActiveContentSyncRequest()
        setStatus(
          'Saved pull request context is not open on GitHub. Open PR mode restored.',
          'neutral',
        )
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Failed to verify pull request state.'
        setStatus(`Could not verify saved pull request state: ${message}`, 'error')
      } finally {
        if (state.pendingContextVerifyAbortController === abortController) {
          state.pendingContextVerifyAbortController = null
        }
      }
    }

    const requestPromise = runVerifyRequest()
    state.pendingContextVerifyRequestKey = requestKey
    state.pendingContextVerifyPromise = requestPromise

    try {
      await requestPromise
    } finally {
      if (state.pendingContextVerifyPromise === requestPromise) {
        state.pendingContextVerifyPromise = null
        state.pendingContextVerifyRequestKey = ''
      }
    }
  }

  return {
    abortPendingActiveContentSyncRequest,
    abortPendingContextVerifyRequest,
    syncActivePrEditorContent,
    verifyActivePullRequestContext,
  }
}
