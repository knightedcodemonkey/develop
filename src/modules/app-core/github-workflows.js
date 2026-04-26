import { repositoryStarterSelectionIdPrefix } from '../constants.js'

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
  workspacesSelect,
  workspacesOpen,
  workspacesRemove,
  workspaceStorage,
  getActiveWorkspaceRecordId,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  listLocalContextRecords,
  refreshLocalContextOptions,
  applyWorkspaceRecord,
  syncActiveWorkspaceRepositoryScope,
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
  onPrContextDisconnected,
  getTokenForVisibility,
  closeWorkspacesDrawer,
  getActivePrEditorSyncKey,
  syncFromActiveContext,
  applyRenderMode,
  applyStyleMode,
  formatActivePrReference,
  githubPrContextClose,
  githubPrContextDisconnect,
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

  const parseRepositoryStarterSelectionId = value => {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''
    if (!normalizedValue.startsWith(repositoryStarterSelectionIdPrefix)) {
      return ''
    }

    const repositoryFullName = normalizedValue.slice(
      repositoryStarterSelectionIdPrefix.length,
    )
    return typeof repositoryFullName === 'string' ? repositoryFullName.trim() : ''
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

  const prEditorSyncController = createGitHubPrEditorSyncController({
    setComponentSource: value => {
      setComponentSource(value)
    },
    setStylesSource: value => {
      setStylesSource(value)
    },
    scheduleRender,
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
    getTopLevelDeclarations,
    getRenderMode,
    getStyleMode,
    getDrawerSide: () => {
      return 'right'
    },
    confirmBeforeSubmit: options => {
      confirmAction(options)
    },
    onPullRequestOpened: ({ url, fileUpdates, repositoryFullName }) => {
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
      showAppToast(message)
    },
    onPullRequestCommitPushed: ({ repositoryFullName, branch, fileUpdates }) => {
      if (shouldReconcileWorkspaceUpdatesForRepository(repositoryFullName)) {
        reconcileWorkspaceTabsWithPushUpdates(fileUpdates)
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

      if (activeContext) {
        closeWorkspacesDrawer()
      }

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
        return {
          synced: false,
          componentSynced: false,
          stylesSynced: false,
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
    onRepositoryFilterChange: async repositoryFilter => {
      if (repositoryFilter === '__local__') {
        clearCurrentSelectedRepository?.()
      } else {
        setCurrentSelectedRepository?.(repositoryFilter)
      }

      prDrawerController.resetStatus?.()
      prDrawerController.syncRepositories()
    },
    getDrawerSide: () => {
      return 'right'
    },
    onRefreshRequested: listLocalContextRecords,
    onOpenSelected: async workspaceId => {
      try {
        const starterRepositoryFullName = parseRepositoryStarterSelectionId(workspaceId)
        if (starterRepositoryFullName) {
          setCurrentSelectedRepository?.(starterRepositoryFullName)
          await syncActiveWorkspaceRepositoryScope?.(starterRepositoryFullName, {
            rekeyRecord: true,
          })
          await refreshLocalContextOptions()
          prDrawerController.resetStatus?.()
          prDrawerController.syncRepositories()
          return true
        }

        const record = await workspaceStorage.getWorkspaceById(workspaceId)
        if (!record) {
          await refreshLocalContextOptions()
          workspacesDrawerController?.setStatus(
            'Stored local context no longer exists.',
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
          'Could not load selected local context.',
          'error',
        )
        return false
      }
    },
    onRemoveSelected: async workspaceId => {
      confirmAction({
        title: 'Remove stored local context?',
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
                'Removed stored local context.',
                'neutral',
              )
            })
            .catch(() => {
              workspacesDrawerController?.setStatus(
                'Could not remove stored local context.',
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

  githubPrContextClose?.addEventListener('click', () => {
    if (!githubAiContextState.activePrContext) {
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
      },
    })
  })

  githubPrContextDisconnect?.addEventListener('click', () => {
    if (!githubAiContextState.activePrContext) {
      return
    }

    const activePrReference = formatActivePrReference(
      githubAiContextState.activePrContext,
    )
    const referenceLine = activePrReference ? `PR: ${activePrReference}\n` : ''

    confirmAction({
      title: 'Disconnect PR context?',
      copy: `${referenceLine}This will disconnect the active pull request context in this app only.\nYour pull request will stay open on GitHub.\nYour GitHub token and selected repository will stay connected.`,
      confirmButtonText: 'Disconnect',
      onConfirm: () => {
        const result = prDrawerController.disconnectActivePrContext()
        const reference = result?.reference
        setStatus(
          reference
            ? `Disconnected PR context (${reference}). Pull request remains open on GitHub.`
            : 'Disconnected PR context. Pull request remains open on GitHub.',
          'neutral',
        )
        if (typeof onPrContextDisconnected === 'function') {
          onPrContextDisconnected(result)
        }
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
