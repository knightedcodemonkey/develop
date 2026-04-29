export const createRunSubmit = ({
  state,
  getSelectedRepositoryObject,
  getRepositoryFullName,
  getToken,
  getCurrentActivePrContext,
  getFormValues,
  getRenderMode,
  getStyleMode,
  prTitleInput,
  includeAppWrapperToggle,
  getFileCommits,
  persistWorkspaceMetadataOnSubmit,
  getTopLevelDeclarations,
  confirmBeforeSubmit,
  onPullRequestOpened,
  onPullRequestCommitPushed,
  setStatus,
  setPendingState,
  setOpen,
  setSubmitButtonLabel,
  emitActivePrContextChange,
  defaultCommitMessage,
  normalizeRenderMode,
  normalizeStyleMode,
  normalizeFileCommits,
  toSafeText,
  sanitizeBranchPart,
  buildSummary,
  stripTopLevelAppWrapper,
  ensureTrailingNewline,
  commitEditorContentToExistingBranch,
  createEditorContentPullRequest,
  formatActivePrReference,
  setRepositoryActivePrContext,
}) => {
  return async () => {
    const repository = getSelectedRepositoryObject()
    const repositoryLabel = getRepositoryFullName(repository)
    const token = getToken?.()
    const activeContext = getCurrentActivePrContext()
    const isPushCommitMode = Boolean(activeContext)

    if (!toSafeText(token)) {
      setStatus(
        isPushCommitMode
          ? 'Add a GitHub token before pushing a commit.'
          : 'Add a GitHub token before opening a pull request.',
        'error',
      )
      return
    }

    if (!repositoryLabel) {
      setStatus(
        isPushCommitMode
          ? 'Select a writable repository before pushing a commit.'
          : 'Select a writable repository before opening a pull request.',
        'error',
      )
      return
    }

    const values = getFormValues()
    const targetBaseBranch = isPushCommitMode
      ? toSafeText(activeContext?.baseBranch)
      : values.baseBranch
    const targetHeadBranch = isPushCommitMode
      ? sanitizeBranchPart(activeContext?.headBranch)
      : sanitizeBranchPart(values.headBranch)
    const targetPrTitle = isPushCommitMode
      ? toSafeText(activeContext?.prTitle)
      : values.prTitle
    const targetPrBody = isPushCommitMode
      ? typeof activeContext?.prBody === 'string'
        ? activeContext.prBody
        : ''
      : values.prBody
    const currentRenderMode = normalizeRenderMode(getRenderMode?.())
    const currentStyleMode = normalizeStyleMode(getStyleMode?.())
    const targetCommitMessage = values.commitMessage || defaultCommitMessage

    if (
      !isPushCommitMode &&
      prTitleInput instanceof HTMLInputElement &&
      !prTitleInput.checkValidity()
    ) {
      prTitleInput.reportValidity()
      return
    }

    const includeAppWrapper =
      includeAppWrapperToggle instanceof HTMLInputElement
        ? includeAppWrapperToggle.checked
        : false

    const { fileCommits: normalizedFileCommits, invalidPaths } = normalizeFileCommits(
      typeof getFileCommits === 'function'
        ? getFileCommits({ includeAllWorkspaceFiles: !isPushCommitMode })
        : [],
    )

    if (invalidPaths.length > 0) {
      const maxInvalidPathsInMessage = 3
      const invalidPathDetails = invalidPaths
        .slice(0, maxInvalidPathsInMessage)
        .map(entry => {
          const sourceLabel = entry.tabLabel ? `${entry.tabLabel}: ` : ''
          return `${sourceLabel}${entry.path} (${entry.reason})`
        })
        .join('; ')
      const remainingCount = invalidPaths.length - maxInvalidPathsInMessage
      const remainingSummary = remainingCount > 0 ? ` (+${remainingCount} more)` : ''

      setStatus(
        `Commit blocked: invalid workspace file path${invalidPaths.length === 1 ? '' : 's'}. ${invalidPathDetails}${remainingSummary}`,
        'error',
      )
      return
    }

    if (normalizedFileCommits.length === 0) {
      setStatus(
        isPushCommitMode
          ? 'No local editor changes to push.'
          : 'No workspace files are available to commit.',
        isPushCommitMode ? 'neutral' : 'error',
      )
      return
    }

    if (!isPushCommitMode && !targetBaseBranch) {
      setStatus('Base branch is required.', 'error')
      return
    }

    if (!targetHeadBranch) {
      setStatus(
        isPushCommitMode
          ? 'Active pull request context is missing a head branch. Close the context and open a new pull request.'
          : 'Head branch name is required.',
        'error',
      )
      return
    }

    if (!targetPrTitle) {
      setStatus(
        isPushCommitMode
          ? 'Active pull request context is missing a title. Close the context and open a new pull request.'
          : 'Pull request title is required.',
        'error',
      )
      return
    }

    const summary = buildSummary({
      repository,
      baseBranch: targetBaseBranch,
      headBranch: targetHeadBranch,
      fileCommits: normalizedFileCommits,
      prTitle: targetPrTitle,
      commitMessage: targetCommitMessage,
      actionType: isPushCommitMode ? 'push-commit' : 'open-pr',
    })

    const fileUpdates = await Promise.all(
      normalizedFileCommits.map(async fileCommit => {
        if (fileCommit.deleted === true) {
          return {
            path: fileCommit.path,
            deleted: true,
          }
        }

        const shouldStripEntryWrapper = !includeAppWrapper && fileCommit.isEntry
        const nextContent = shouldStripEntryWrapper
          ? await stripTopLevelAppWrapper({
              source: fileCommit.content,
              getTopLevelDeclarations,
            })
          : fileCommit.content
        const content = ensureTrailingNewline(nextContent)

        return {
          path: fileCommit.path,
          content,
        }
      }),
    )

    const submitRequest = async () => {
      if (typeof persistWorkspaceMetadataOnSubmit === 'function') {
        try {
          await persistWorkspaceMetadataOnSubmit({
            isPushCommitMode,
            repository: repositoryLabel,
            baseBranch: targetBaseBranch,
            headBranch: targetHeadBranch,
            prTitle: targetPrTitle,
            prBody: targetPrBody,
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Could not persist workspace metadata before submit.'
          setStatus(
            isPushCommitMode
              ? `Push commit blocked: ${message}`
              : `Open PR blocked: ${message}`,
            'error',
          )
          return
        }
      }

      state.pendingAbortController?.abort()
      const abortController = new AbortController()
      state.pendingAbortController = abortController

      setPendingState(true)
      setStatus(
        isPushCommitMode
          ? 'Committing editor files to active pull request branch...'
          : 'Creating branch, committing editor files, and opening pull request...',
        'pending',
      )

      const runRequest = isPushCommitMode
        ? commitEditorContentToExistingBranch({
            token,
            repository,
            branch: targetHeadBranch,
            fileUpdates,
            commitMessage: targetCommitMessage,
            signal: abortController.signal,
          })
        : createEditorContentPullRequest({
            token,
            repository,
            baseBranch: targetBaseBranch,
            headBranch: targetHeadBranch,
            prTitle: targetPrTitle,
            prBody: targetPrBody,
            fileUpdates,
            commitMessage: targetCommitMessage,
            signal: abortController.signal,
          })

      void Promise.resolve(runRequest)
        .then(result => {
          if (isPushCommitMode) {
            const compactPullRequestReference = formatActivePrReference(activeContext)
            const pullRequestUrl = toSafeText(activeContext?.pullRequestUrl)
            const pullRequestTitle = toSafeText(activeContext?.prTitle)
            const pullRequestReference =
              compactPullRequestReference ||
              pullRequestUrl ||
              (pullRequestTitle ? `PR: ${pullRequestTitle}` : '')

            setStatus(
              pullRequestReference
                ? `Commit pushed to ${targetHeadBranch} (${pullRequestReference}).`
                : `Commit pushed to ${targetHeadBranch}.`,
              'ok',
            )
            onPullRequestCommitPushed?.({
              repositoryFullName: repositoryLabel,
              branch: targetHeadBranch,
              fileUpdates: Array.isArray(result) ? result : [],
            })
            setOpen(false)
            return
          }

          setRepositoryActivePrContext({
            repositoryFullName: repositoryLabel,
            activeContext: {
              renderMode: currentRenderMode,
              styleMode: currentStyleMode,
              baseBranch: targetBaseBranch,
              headBranch: targetHeadBranch,
              prTitle: targetPrTitle,
              prBody: targetPrBody,
              pullRequestNumber: result.pullRequest.number,
              pullRequestUrl: result.pullRequest.htmlUrl,
            },
          })

          emitActivePrContextChange()
          setSubmitButtonLabel()

          const url = result.pullRequest.htmlUrl
          setStatus(
            url ? `Pull request opened: ${url}` : 'Pull request opened successfully.',
            'ok',
          )
          onPullRequestOpened?.({
            repositoryFullName: repositoryLabel,
            url,
            pullRequestNumber: result.pullRequest.number,
            branch: targetHeadBranch,
            fileUpdates: Array.isArray(result.fileUpdates) ? result.fileUpdates : [],
          })
          setOpen(false)
        })
        .catch(error => {
          if (abortController.signal.aborted) {
            return
          }

          const fallbackMessage = isPushCommitMode
            ? 'Failed to push commit.'
            : 'Failed to open pull request.'
          const message = error instanceof Error ? error.message : fallbackMessage
          setStatus(
            isPushCommitMode
              ? `Push commit failed: ${message}`
              : `Open PR failed: ${message}`,
            'error',
          )
        })
        .finally(() => {
          if (state.pendingAbortController === abortController) {
            state.pendingAbortController = null
          }
          setPendingState(false)
        })
    }

    if (typeof confirmBeforeSubmit === 'function') {
      confirmBeforeSubmit({
        title: isPushCommitMode
          ? 'Push commit to active pull request branch?'
          : 'Open pull request with editor content?',
        copy: summary,
        confirmButtonText: isPushCommitMode ? 'Push commit' : 'Open PR',
        onConfirm: submitRequest,
      })
      return
    }

    submitRequest()
  }
}
