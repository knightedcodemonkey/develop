export const createContextSyncHandlers = ({
  state,
  getSelectedRepositoryObject,
  getRepositoryFullName,
  getToken,
  getEditorSyncTargets,
  onSyncActivePrEditorContent,
  getCurrentActivePrContext,
  setRepositoryActivePrContext,
  clearRepositoryActivePrContext,
  syncFormForRepository,
  setSubmitButtonLabel,
  emitActivePrContextChange,
  onSavedPullRequestContextClosed,
  setStatus,
  toSafeText,
  sanitizeBranchPart,
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
    const dedupedByPath = new Map()

    for (const target of tabSyncTargets) {
      const kind = toSafeText(target?.kind)
      const path = toSafeText(target?.path)
      if (!path) {
        continue
      }

      dedupedByPath.set(path, { kind, path })
    }

    const normalizedTabSyncTargets = [...dedupedByPath.values()]

    if (normalizedTabSyncTargets.length === 0) {
      state.lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      return
    }

    normalizedTabSyncTargets.sort((left, right) => left.path.localeCompare(right.path))

    const syncKey = [
      repositoryFullName,
      activeContext.headBranch,
      ...normalizedTabSyncTargets.map(target => target.path),
      String(activeContext.pullRequestNumber ?? ''),
    ].join('|')

    if (syncKey === state.lastActiveContentSyncKey) {
      return
    }

    if (
      state.pendingActiveContentSyncAbortController &&
      state.pendingActiveContentSyncKey === syncKey
    ) {
      return
    }

    abortPendingActiveContentSyncRequest()
    const abortController = new AbortController()
    state.pendingActiveContentSyncAbortController = abortController
    state.pendingActiveContentSyncKey = syncKey

    try {
      const syncResult = await onSyncActivePrEditorContent({
        token,
        repository,
        activeContext,
        syncTargets: {
          tabTargets: normalizedTabSyncTargets,
        },
        signal: abortController.signal,
      })

      if (state.pendingActiveContentSyncAbortController !== abortController) {
        return
      }

      state.lastActiveContentSyncKey = syncResult?.synced === true ? syncKey : ''
    } catch {
      if (abortController.signal.aborted) {
        return
      }
    } finally {
      if (state.pendingActiveContentSyncAbortController === abortController) {
        state.pendingActiveContentSyncAbortController = null
        state.pendingActiveContentSyncKey = ''
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

    const activeContext = getCurrentActivePrContext()
    if (!activeContext) {
      return
    }

    const pullRequestNumberFromConfig =
      typeof activeContext.pullRequestNumber === 'number' &&
      Number.isFinite(activeContext.pullRequestNumber)
        ? activeContext.pullRequestNumber
        : null
    const headBranch = sanitizeBranchPart(activeContext.headBranch)

    if (!pullRequestNumberFromConfig && !headBranch) {
      return
    }

    const requestKey = [
      repositoryFullName,
      String(pullRequestNumberFromConfig || ''),
      headBranch,
      toSafeText(activeContext.baseBranch),
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
            baseBranch: toSafeText(activeContext.baseBranch),
            signal: abortController.signal,
          })
        }

        if (state.pendingContextVerifyAbortController !== abortController) {
          return
        }

        if (resolvedPullRequest?.isOpen) {
          const nextHeadBranch =
            sanitizeBranchPart(resolvedPullRequest.headRef) || headBranch
          const nextBaseBranch =
            toSafeText(resolvedPullRequest.baseRef) ||
            toSafeText(activeContext.baseBranch)

          setRepositoryActivePrContext({
            repositoryFullName,
            activeContext: {
              ...activeContext,
              headBranch: nextHeadBranch,
              baseBranch: nextBaseBranch,
              pullRequestNumber: resolvedPullRequest.number,
              pullRequestUrl: resolvedPullRequest.htmlUrl,
              prTitle:
                toSafeText(activeContext.prTitle) ||
                toSafeText(resolvedPullRequest.title),
            },
          })
          syncFormForRepository({ resetBranch: true })
          setSubmitButtonLabel()
          emitActivePrContextChange()
          void syncActivePrEditorContent()
          return
        }

        clearRepositoryActivePrContext(repositoryFullName)
        setStatus(
          'Saved pull request context is not open on GitHub. Open PR mode restored.',
          'neutral',
        )
        setSubmitButtonLabel()
        emitActivePrContextChange()
        if (typeof onSavedPullRequestContextClosed === 'function') {
          onSavedPullRequestContextClosed({
            repositoryFullName,
            pullRequestNumber:
              typeof activeContext.pullRequestNumber === 'number' &&
              Number.isFinite(activeContext.pullRequestNumber)
                ? activeContext.pullRequestNumber
                : pullRequestNumberFromConfig,
            pullRequestUrl: toSafeText(activeContext.pullRequestUrl),
            headBranch: toSafeText(activeContext.headBranch),
            baseBranch: toSafeText(activeContext.baseBranch),
            prTitle: toSafeText(activeContext.prTitle),
          })
        }
        state.lastActiveContentSyncKey = ''
        abortPendingActiveContentSyncRequest()
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
