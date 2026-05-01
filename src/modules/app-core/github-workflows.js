const initializeGitHubWorkflows = ({
  createGitHubPrEditorSyncController,
  createGitHubChatDrawer,
  createGitHubPrDrawer,
  createWorkspacesDrawer,
  ensureJsxTransformSource,
  collectTopLevelDeclarations,
  cdnImports,
  importFromCdnWithFallback,
  githubAiContextState,
  byotControls,
  getCurrentGitHubToken,
  getCurrentSelectedRepository,
  aiChatToggle,
  aiChatDrawer,
  aiChatClose,
  aiChatPrompt,
  aiChatModel,
  aiChatIncludeEditors,
  aiChatSend,
  aiChatClear,
  aiChatStatus,
  aiChatRepository,
  aiChatMessages,
  githubPrToggle,
  githubPrDrawer,
  githubPrClose,
  githubPrRepoSelect,
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrTitle,
  githubPrBody,
  githubPrCommitMessage,
  githubPrIncludeAppWrapper,
  githubPrSubmit,
  openPrTitle,
  githubPrStatus,
  workspacesToggle,
  workspacesDrawer,
  workspacesClose,
  workspacesStatus,
  workspacesRepository,
  workspacesInitialize,
  workspacesNew,
  workspacesSelect,
  workspacesOpen,
  workspacesRemove,
  workspaceStorage,
  getActiveWorkspaceRecordId,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  buildWorkspaceRecordSnapshot,
  listLocalContextRecords,
  refreshLocalContextOptions,
  applyWorkspaceRecord,
  syncActiveWorkspaceRepositoryScope,
  forkWorkspaceFromCurrentState,
  flushWorkspaceSave,
  getWorkspacePrFileCommits,
  getEditorSyncTargets,
  getRenderMode,
  getStyleMode,
  setCurrentSelectedRepository,
  clearCurrentSelectedRepository,
  getPersistedActivePrContext,
  reconcileWorkspaceTabsWithPushUpdates,
  getActivePrContextSyncKey,
  prContextUi,
  onPrContextStateChange,
  onPrContextVerifiedClosed,
  onPrContextClosed,
  getTokenForVisibility,
  getActivePrEditorSyncKey,
  syncFromActiveContext,
  applyRenderMode,
  applyStyleMode,
  formatActivePrReference,
  githubPrContextClose,
  confirmAction,
  setStatus,
  showAppToast,
  setComponentSource,
  setStylesSource,
  getComponentSource,
  getStylesSource,
  scheduleRender,
}) => {
  const getCurrentWritableRepositories = () =>
    githubAiContextState.writableRepositories.length > 0
      ? [...githubAiContextState.writableRepositories]
      : byotControls.getWritableRepositories()

  const getTopLevelDeclarations = async source => {
    if (typeof source !== 'string' || !source.trim()) {
      return []
    }

    const transformJsxSource = await ensureJsxTransformSource({
      cdnImports,
      importFromCdnWithFallback,
    })
    return collectTopLevelDeclarations({ source, transformJsxSource })
  }

  const shouldReconcileWorkspaceUpdatesForRepository = repositoryFullName => {
    const normalizedActiveRepository =
      typeof githubAiContextState.activePrContext?.repositoryFullName === 'string'
        ? githubAiContextState.activePrContext.repositoryFullName.trim()
        : ''
    const normalizedIncomingRepository =
      typeof repositoryFullName === 'string' ? repositoryFullName.trim() : ''

    return (
      !normalizedActiveRepository ||
      !normalizedIncomingRepository ||
      normalizedActiveRepository === normalizedIncomingRepository
    )
  }

  const toSafeRepositoryFullName = value =>
    typeof value === 'string' ? value.trim() : ''

  const toWorkspaceIdentitySegment = value => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''

    if (!normalized) {
      return ''
    }

    return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  const toWorkspaceRecordKey = ({ repositoryFullName, headBranch } = {}) => {
    const repoSegment = toWorkspaceIdentitySegment(repositoryFullName) || 'local'
    const headSegment = toWorkspaceIdentitySegment(headBranch) || 'draft'
    return `${repoSegment}::${headSegment}`
  }

  const shouldApplyActivePrEditorSync = ({ repository, activeContext }) => {
    const syncedContextKey = getActivePrContextSyncKey(activeContext)
    const currentSyncKey = getActivePrEditorSyncKey()
    if (!syncedContextKey || syncedContextKey !== currentSyncKey) {
      return false
    }

    const selectedRepositoryFullName = toSafeRepositoryFullName(
      getCurrentSelectedRepository()?.fullName,
    )
    const incomingRepositoryFullName = toSafeRepositoryFullName(repository?.fullName)
    const activeContextRepositoryFullName = toSafeRepositoryFullName(
      activeContext?.repositoryFullName,
    )

    if (
      selectedRepositoryFullName &&
      incomingRepositoryFullName &&
      selectedRepositoryFullName !== incomingRepositoryFullName
    ) {
      return false
    }

    if (
      activeContextRepositoryFullName &&
      incomingRepositoryFullName &&
      activeContextRepositoryFullName !== incomingRepositoryFullName
    ) {
      return false
    }

    return true
  }

  const persistActiveWorkspaceSnapshot = async () => {
    if (typeof buildWorkspaceRecordSnapshot !== 'function') {
      return null
    }

    const activeWorkspaceRecordId =
      typeof getActiveWorkspaceRecordId === 'function' ? getActiveWorkspaceRecordId() : ''

    const snapshot =
      typeof activeWorkspaceRecordId === 'string' && activeWorkspaceRecordId.trim()
        ? buildWorkspaceRecordSnapshot({ recordId: activeWorkspaceRecordId })
        : buildWorkspaceRecordSnapshot()

    if (!snapshot || typeof snapshot !== 'object') {
      return null
    }

    const savedWorkspaceRecord = await workspaceStorage.upsertWorkspace(snapshot)
    setActiveWorkspaceRecordId(savedWorkspaceRecord.id)
    setActiveWorkspaceCreatedAt(savedWorkspaceRecord.createdAt ?? null)
    return savedWorkspaceRecord
  }

  const prEditorSyncController = createGitHubPrEditorSyncController({
    shouldApplySyncResult: shouldApplyActivePrEditorSync,
  })

  const chatDrawerController = createGitHubChatDrawer({
    toggleButton: aiChatToggle,
    drawer: aiChatDrawer,
    closeButton: aiChatClose,
    promptInput: aiChatPrompt,
    modelSelect: aiChatModel,
    includeEditorsContextToggle: aiChatIncludeEditors,
    sendButton: aiChatSend,
    clearButton: aiChatClear,
    statusNode: aiChatStatus,
    repositoryNode: aiChatRepository,
    messagesNode: aiChatMessages,
    getToken: getCurrentGitHubToken,
    getSelectedRepository: getCurrentSelectedRepository,
    getComponentSource,
    setComponentSource,
    getStylesSource,
    setStylesSource,
    scheduleRender,
    getRenderMode,
    getStyleMode,
    getDrawerSide: () => {
      return 'right'
    },
    getPersistedActivePrContext,
  })

  const prDrawerController = createGitHubPrDrawer({
    toggleButton: githubPrToggle,
    drawer: githubPrDrawer,
    closeButton: githubPrClose,
    repositorySelect: githubPrRepoSelect,
    baseBranchInput: githubPrBaseBranch,
    headBranchInput: githubPrHeadBranch,
    prTitleInput: githubPrTitle,
    prBodyInput: githubPrBody,
    commitMessageInput: githubPrCommitMessage,
    includeAppWrapperToggle: githubPrIncludeAppWrapper,
    submitButton: githubPrSubmit,
    titleNode: openPrTitle,
    statusNode: githubPrStatus,
    getToken: getCurrentGitHubToken,
    getSelectedRepository: getCurrentSelectedRepository,
    getWritableRepositories: getCurrentWritableRepositories,
    setSelectedRepository: setCurrentSelectedRepository,
    getFileCommits: getWorkspacePrFileCommits,
    getEditorSyncTargets,
    persistWorkspaceMetadataOnSubmit: async () => {
      if (typeof flushWorkspaceSave !== 'function') {
        return
      }

      await flushWorkspaceSave({ preserveRecordId: true })
    },
    getTopLevelDeclarations,
    getRenderMode,
    getStyleMode,
    getDrawerSide: () => {
      return 'right'
    },
    confirmBeforeSubmit: options => {
      confirmAction(options)
    },
    onPullRequestOpened: async ({
      url,
      fileUpdates,
      repositoryFullName,
      pullRequestNumber,
    }) => {
      if (typeof onPrContextStateChange === 'function') {
        onPrContextStateChange(githubAiContextState.activePrContext)
      }

      const activeContextSyncKey = getActivePrContextSyncKey(
        githubAiContextState.activePrContext,
      )
      if (activeContextSyncKey && activeContextSyncKey === getActivePrEditorSyncKey()) {
        prContextUi.markActivePrEditorContentSynced()
      }

      const message = url
        ? `Pull request opened: ${url}`
        : 'Pull request opened successfully.'
      if (shouldReconcileWorkspaceUpdatesForRepository(repositoryFullName)) {
        reconcileWorkspaceTabsWithPushUpdates(fileUpdates)
      }

      if (typeof flushWorkspaceSave === 'function') {
        try {
          await flushWorkspaceSave({ preserveRecordId: true })
        } catch {
          /* Save failures are already surfaced through saver onError. */
        }
      }

      const activeWorkspaceRecordId =
        typeof getActiveWorkspaceRecordId === 'function'
          ? getActiveWorkspaceRecordId()
          : ''
      if (activeWorkspaceRecordId) {
        const activeWorkspaceRecord = await workspaceStorage.getWorkspaceById(
          activeWorkspaceRecordId,
        )
        if (activeWorkspaceRecord && typeof activeWorkspaceRecord === 'object') {
          const nextHeadBranch =
            typeof githubAiContextState.activePrContext?.headBranch === 'string' &&
            githubAiContextState.activePrContext.headBranch.trim()
              ? githubAiContextState.activePrContext.headBranch.trim()
              : typeof branch === 'string' && branch.trim()
                ? branch.trim()
                : typeof activeWorkspaceRecord.head === 'string'
                  ? activeWorkspaceRecord.head
                  : ''
          const nextBaseBranch =
            typeof githubAiContextState.activePrContext?.baseBranch === 'string' &&
            githubAiContextState.activePrContext.baseBranch.trim()
              ? githubAiContextState.activePrContext.baseBranch.trim()
              : typeof activeWorkspaceRecord.base === 'string'
                ? activeWorkspaceRecord.base
                : ''
          const nextRepositoryFullName =
            toSafeRepositoryFullName(repositoryFullName) ||
            toSafeRepositoryFullName(
              githubAiContextState.activePrContext?.repositoryFullName,
            ) ||
            toSafeRepositoryFullName(activeWorkspaceRecord.repo)
          const nextPrTitle =
            typeof githubAiContextState.activePrContext?.prTitle === 'string' &&
            githubAiContextState.activePrContext.prTitle.trim()
              ? githubAiContextState.activePrContext.prTitle
              : typeof activeWorkspaceRecord.prTitle === 'string'
                ? activeWorkspaceRecord.prTitle
                : ''
          const nextPrNumber =
            typeof pullRequestNumber === 'number' && Number.isFinite(pullRequestNumber)
              ? pullRequestNumber
              : typeof githubAiContextState.activePrContext?.pullRequestNumber ===
                    'number' &&
                  Number.isFinite(githubAiContextState.activePrContext.pullRequestNumber)
                ? githubAiContextState.activePrContext.pullRequestNumber
                : null

          const savedWorkspaceRecord = await workspaceStorage.upsertWorkspace({
            ...activeWorkspaceRecord,
            workspaceScope: nextRepositoryFullName ? 'repository' : 'local',
            workspaceKey: toWorkspaceRecordKey({
              repositoryFullName: nextRepositoryFullName,
              headBranch: nextHeadBranch,
            }),
            repo: nextRepositoryFullName,
            base: nextBaseBranch,
            head: nextHeadBranch,
            prContextState: 'active',
            prNumber: nextPrNumber,
            prTitle: nextPrTitle,
          })

          setActiveWorkspaceRecordId(savedWorkspaceRecord.id)
          setActiveWorkspaceCreatedAt(savedWorkspaceRecord.createdAt ?? null)
        }
      }

      await refreshLocalContextOptions()
      showAppToast(message)
    },
    onPullRequestCommitPushed: async ({ repositoryFullName, branch, fileUpdates }) => {
      if (shouldReconcileWorkspaceUpdatesForRepository(repositoryFullName)) {
        reconcileWorkspaceTabsWithPushUpdates(fileUpdates)
      }

      try {
        await persistActiveWorkspaceSnapshot()
      } catch {
        /* Fall back to debounced saver flush below. */
      }

      if (typeof flushWorkspaceSave === 'function') {
        try {
          await flushWorkspaceSave({ preserveRecordId: true })
        } catch {
          /* Save failures are already surfaced through saver onError. */
        }
      }

      const fileCount = Array.isArray(fileUpdates) ? fileUpdates.length : 0
      const message =
        fileCount > 0
          ? `Pushed commit to ${branch} (${fileCount} file${fileCount === 1 ? '' : 's'}).`
          : `Pushed commit to ${branch}.`
      showAppToast(message)
    },
    onActivePrContextChange: activeContext => {
      prContextUi.setActivePrContext(activeContext)
      prContextUi.syncAiChatTokenVisibility(getTokenForVisibility())

      if (typeof onPrContextStateChange === 'function') {
        onPrContextStateChange(activeContext)
      }
    },
    onSavedPullRequestContextClosed: payload => {
      if (typeof onPrContextVerifiedClosed === 'function') {
        onPrContextVerifiedClosed(payload)
      }
    },
    onSyncActivePrEditorContent: async args => {
      if (!shouldApplyActivePrEditorSync(args ?? {})) {
        const tabTargets = Array.isArray(args?.syncTargets?.tabTargets)
          ? args.syncTargets.tabTargets
          : []
        return {
          synced: false,
          syncedTabCount: 0,
          totalTabCount: tabTargets.length,
        }
      }

      const result = await prEditorSyncController.syncFromActiveContext(args)
      if (!shouldApplyActivePrEditorSync(args ?? {})) {
        return result
      }

      if (result?.synced === true) {
        prContextUi.markActivePrEditorContentSynced()

        syncFromActiveContext({
          tabTargets: result?.syncTargets?.tabTargets ?? args?.syncTargets?.tabTargets,
        })
      }

      return result
    },
    onRestoreRenderMode: mode => {
      applyRenderMode({ mode, fromActivePrContext: true })
    },
    onRestoreStyleMode: mode => {
      applyStyleMode({ mode })
    },
  })

  const workspacesDrawerController = createWorkspacesDrawer({
    toggleButton: workspacesToggle,
    drawer: workspacesDrawer,
    closeButton: workspacesClose,
    statusNode: workspacesStatus,
    repositorySelect: workspacesRepository,
    getActiveWorkspaceId: () => getActiveWorkspaceRecordId(),
    initializeButton: workspacesInitialize,
    newButton: workspacesNew,
    selectInput: workspacesSelect,
    openButton: workspacesOpen,
    removeButton: workspacesRemove,
    getRepositoryFilterOptions: () =>
      getCurrentWritableRepositories().map(repository => ({
        value: repository.fullName,
        label: repository.fullName,
      })),
    getSelectedRepositoryFilter: () => {
      const selectedRepository = getCurrentSelectedRepository()
      if (typeof selectedRepository?.fullName === 'string') {
        const fullName = selectedRepository.fullName.trim()
        if (fullName) {
          return fullName
        }
      }

      return '__local__'
    },
    onRepositoryFilterChange: async () => {
      prDrawerController.resetStatus?.()
      prDrawerController.syncRepositories()
    },
    getDrawerSide: () => {
      return 'right'
    },
    onRefreshRequested: listLocalContextRecords,
    onInitializeWorkspace: async repositoryFilter => {
      const normalizedFilter =
        typeof repositoryFilter === 'string' ? repositoryFilter.trim() : ''
      if (!normalizedFilter || normalizedFilter === '__local__') {
        return false
      }

      const repositoryFullName = normalizedFilter

      try {
        await syncActiveWorkspaceRepositoryScope?.(repositoryFullName, {
          rekeyRecord: false,
        })
        setCurrentSelectedRepository?.(repositoryFullName)
        await refreshLocalContextOptions()
        prDrawerController.resetStatus?.()
        prDrawerController.syncRepositories()
        return true
      } catch {
        workspacesDrawerController?.setStatus('Could not initialize workspace.', 'error')
        return false
      }
    },
    onCreateWorkspace: async repositoryFilter => {
      const normalizedFilter =
        typeof repositoryFilter === 'string' ? repositoryFilter.trim() : ''
      const repositoryFullName =
        normalizedFilter && normalizedFilter !== '__local__' ? normalizedFilter : ''

      try {
        await forkWorkspaceFromCurrentState?.(repositoryFullName)
        prDrawerController.clearSelectedRepositoryActivePrContext?.({
          resetForm: false,
        })

        if (repositoryFullName) {
          setCurrentSelectedRepository?.(repositoryFullName)
        } else {
          clearCurrentSelectedRepository?.()
        }

        await refreshLocalContextOptions()
        prDrawerController.resetStatus?.()
        prDrawerController.syncRepositories()
        return true
      } catch {
        workspacesDrawerController?.setStatus('Could not create workspace.', 'error')
        return false
      }
    },
    onOpenSelected: async workspaceId => {
      try {
        const record = await workspaceStorage.getWorkspaceById(workspaceId)
        if (!record) {
          await refreshLocalContextOptions()
          workspacesDrawerController?.setStatus(
            'Stored workspace no longer exists.',
            'error',
          )
          return false
        }

        const applied = await applyWorkspaceRecord(record, { silent: false })
        if (applied) {
          prDrawerController.resetStatus?.()
          prDrawerController.syncRepositories()
        }

        return applied
      } catch {
        workspacesDrawerController?.setStatus(
          'Could not load selected workspace.',
          'error',
        )
        return false
      }
    },
    onRemoveSelected: async workspaceId => {
      confirmAction({
        title: 'Remove stored workspace?',
        copy: 'This removes only local workspace metadata and editor content from this browser.',
        confirmButtonText: 'Remove',
        onConfirm: () => {
          void workspaceStorage
            .removeWorkspace(workspaceId)
            .then(async () => {
              if (getActiveWorkspaceRecordId() === workspaceId) {
                setActiveWorkspaceRecordId('')
                setActiveWorkspaceCreatedAt(null)
              }

              await refreshLocalContextOptions()
              workspacesDrawerController?.setStatus(
                'Removed stored workspace.',
                'neutral',
              )
            })
            .catch(() => {
              workspacesDrawerController?.setStatus(
                'Could not remove stored workspace.',
                'error',
              )
            })
        },
      })

      return false
    },
  })

  prDrawerController.setToken(githubAiContextState.token)
  prDrawerController.setSelectedRepository(githubAiContextState.selectedRepository)
  prDrawerController.syncRepositories()
  prContextUi.setActivePrContext(prDrawerController.getActivePrContext())
  if (typeof onPrContextStateChange === 'function') {
    onPrContextStateChange(prDrawerController.getActivePrContext())
  }

  let isClosingActivePullRequest = false

  githubPrContextClose?.addEventListener('click', () => {
    if (!githubAiContextState.activePrContext || isClosingActivePullRequest) {
      return
    }

    const activePrReference = formatActivePrReference(
      githubAiContextState.activePrContext,
    )
    const referenceLine = activePrReference ? `PR: ${activePrReference}\n` : ''

    confirmAction({
      title: 'Close pull request on GitHub?',
      copy: `${referenceLine}PR title: ${githubAiContextState.activePrContext.prTitle}\nHead branch: ${githubAiContextState.activePrContext.headBranch}\n\nThis will close the pull request on GitHub and clear the active pull request context for the selected repository.`,
      confirmButtonText: 'Close PR on GitHub',
      onConfirm: () => {
        if (isClosingActivePullRequest) {
          return
        }

        isClosingActivePullRequest = true
        if (githubPrContextClose instanceof HTMLButtonElement) {
          githubPrContextClose.disabled = true
        }

        void prDrawerController
          .closeActivePullRequestOnGitHub()
          .then(result => {
            const reference = result?.reference
            setStatus(
              reference
                ? `Closed pull request on GitHub and cleared active context (${reference}).`
                : 'Closed pull request on GitHub and cleared active context.',
              'neutral',
            )
            if (typeof onPrContextClosed === 'function') {
              onPrContextClosed(result)
            }
            showAppToast(
              reference
                ? `Closed pull request on GitHub and cleared active context (${reference}).`
                : 'Closed pull request on GitHub and cleared active context.',
            )
          })
          .catch(error => {
            const message =
              error instanceof Error
                ? error.message
                : 'Could not close pull request context on GitHub.'
            setStatus(`Close context failed: ${message}`, 'error')
            showAppToast(`Close context failed: ${message}`)
          })
          .finally(() => {
            isClosingActivePullRequest = false
            if (githubPrContextClose instanceof HTMLButtonElement) {
              githubPrContextClose.disabled = false
            }
          })
      },
    })
  })

  return {
    chatDrawerController,
    prDrawerController,
    workspacesDrawerController,
  }
}

export { initializeGitHubWorkflows }
