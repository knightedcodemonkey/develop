export const createWorkspacePrSessionHandoffController = ({
  defaults,
  state,
  ui,
  workspace,
  runtime,
  selectors,
  utils,
}) => {
  const { defaultComponentTabName, defaultComponentTabPath } = defaults
  const {
    getWorkspacePrNumber,
    setWorkspacePrContextState,
    setWorkspacePrNumber,
    getActiveWorkspaceCreatedAt,
    setActiveWorkspaceRecordId,
    setActiveWorkspaceCreatedAt,
  } = state
  const {
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    githubPrBody,
    setStatus,
  } = ui
  const {
    workspaceStorage,
    workspaceTabsState,
    buildWorkspaceRecordSnapshot,
    buildWorkspaceTabsSnapshot,
    flushWorkspaceSave,
    refreshLocalContextOptions,
    renderWorkspaceTabs,
    syncHeaderLabels,
    loadWorkspaceTabIntoEditor,
    getActiveWorkspaceTab,
  } = workspace
  const { getRenderRuntime, getUpdateRenderModeEditability } = runtime
  const { getCurrentSelectedRepositoryFullName } = selectors
  const { toNonEmptyWorkspaceText } = utils

  let lastKnownPrContextMeta = null

  const createFreshLocalEntryTab = () => {
    const now = Date.now()

    return {
      id: 'component',
      name: defaultComponentTabName,
      path: defaultComponentTabPath,
      language: 'javascript-jsx',
      role: 'entry',
      isActive: true,
      scroll: 0,
      content: '',
      targetPrFilePath: null,
      isDirty: false,
      syncedAt: null,
      lastSyncedRemoteSha: null,
      syncedContent: null,
      lastModified: now,
    }
  }

  const startFreshLocalWorkspace = async ({ statusMessage } = {}) => {
    const now = Date.now()
    const localWorkspaceId = `local_${now}`
    let didPersistFreshWorkspace = false

    setWorkspacePrContextState('inactive')
    setWorkspacePrNumber(null)
    lastKnownPrContextMeta = null

    if (githubPrHeadBranch) {
      githubPrHeadBranch.value = ''
    }

    if (githubPrTitle) {
      githubPrTitle.value = ''
    }

    if (githubPrBody) {
      githubPrBody.value = ''
    }

    setActiveWorkspaceRecordId(localWorkspaceId)
    setActiveWorkspaceCreatedAt(null)

    workspaceTabsState.replaceTabs({
      tabs: [createFreshLocalEntryTab()],
      activeTabId: 'component',
    })

    const activeTab = getActiveWorkspaceTab()
    if (activeTab) {
      loadWorkspaceTabIntoEditor(activeTab)
    }

    const renderRuntime =
      typeof getRenderRuntime === 'function' ? getRenderRuntime() : null
    if (renderRuntime && typeof renderRuntime.clearPreview === 'function') {
      renderRuntime.clearPreview()
    }

    renderWorkspaceTabs()
    syncHeaderLabels()

    if (typeof flushWorkspaceSave === 'function') {
      void flushWorkspaceSave().catch(() => {
        /* Save failures are already surfaced through saver onError. */
      })
    }

    const updateRenderModeEditability =
      typeof getUpdateRenderModeEditability === 'function'
        ? getUpdateRenderModeEditability()
        : null
    if (typeof updateRenderModeEditability === 'function') {
      updateRenderModeEditability()
    }

    try {
      const saved = await workspaceStorage.upsertWorkspace({
        ...buildWorkspaceRecordSnapshot({ recordId: localWorkspaceId }),
        id: localWorkspaceId,
        repo: getCurrentSelectedRepositoryFullName(),
        base: '',
        head: '',
        prTitle: '',
        prNumber: null,
        prContextState: 'inactive',
        tabs: buildWorkspaceTabsSnapshot(),
        activeTabId: workspaceTabsState.getActiveTabId(),
        createdAt: now,
        lastModified: now,
      })

      if (saved?.id) {
        setActiveWorkspaceRecordId(saved.id)
        setActiveWorkspaceCreatedAt(
          typeof saved.createdAt === 'number' && Number.isFinite(saved.createdAt)
            ? saved.createdAt
            : getActiveWorkspaceCreatedAt(),
        )
      }

      await refreshLocalContextOptions()
      didPersistFreshWorkspace = true
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not persist the fresh local workspace.'
      setStatus(
        `Switched to a fresh local workspace, but persistence failed: ${message}`,
        'error',
      )
    }

    if (
      didPersistFreshWorkspace &&
      typeof statusMessage === 'string' &&
      statusMessage.trim().length > 0
    ) {
      setStatus(statusMessage.trim(), 'neutral')
    }
  }

  const archivePrWorkspaceAndStartFreshLocal = ({
    archivedState,
    statusMessage,
  } = {}) => {
    const nextState = typeof archivedState === 'string' ? archivedState.trim() : ''
    if (!nextState) {
      return
    }

    setWorkspacePrContextState(nextState)

    const fallbackBaseBranch =
      typeof lastKnownPrContextMeta?.baseBranch === 'string'
        ? lastKnownPrContextMeta.baseBranch
        : ''
    const fallbackHeadBranch =
      typeof lastKnownPrContextMeta?.headBranch === 'string'
        ? lastKnownPrContextMeta.headBranch
        : ''
    const fallbackPrTitle =
      typeof lastKnownPrContextMeta?.prTitle === 'string'
        ? lastKnownPrContextMeta.prTitle
        : ''

    const selectedRepository = toNonEmptyWorkspaceText(
      getCurrentSelectedRepositoryFullName(),
    )
    const workspacePrNumber = getWorkspacePrNumber()
    const fallbackSnapshot = buildWorkspaceRecordSnapshot()
    const freshWorkspaceTransition = startFreshLocalWorkspace({ statusMessage }).catch(
      error => {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not switch to a safe local workspace.'
        setStatus(
          `Archive handoff failed to switch to a safe local workspace: ${message}`,
          'error',
        )
      },
    )

    const runArchiveHandoff = async () => {
      try {
        const siblingRecords = selectedRepository
          ? await workspaceStorage.listWorkspaces({ repo: selectedRepository })
          : await workspaceStorage.listWorkspaces()
        const normalizedArchiveHead = toNonEmptyWorkspaceText(
          toNonEmptyWorkspaceText(githubPrHeadBranch?.value) ||
            toNonEmptyWorkspaceText(fallbackHeadBranch),
        )
        const activeRecordsForContext = siblingRecords.filter(record => {
          if (!record || typeof record !== 'object') {
            return false
          }

          if (toNonEmptyWorkspaceText(record.prContextState).toLowerCase() !== 'active') {
            return false
          }

          if (
            selectedRepository &&
            toNonEmptyWorkspaceText(record.repo) !== selectedRepository
          ) {
            return false
          }

          const hasMatchingPrNumber =
            typeof workspacePrNumber === 'number' &&
            Number.isFinite(workspacePrNumber) &&
            typeof record.prNumber === 'number' &&
            Number.isFinite(record.prNumber) &&
            record.prNumber === workspacePrNumber

          const hasMatchingHead =
            normalizedArchiveHead &&
            toNonEmptyWorkspaceText(record.head) === normalizedArchiveHead

          return hasMatchingPrNumber || hasMatchingHead
        })
        const primaryArchiveRecord = activeRecordsForContext[0] ?? null
        const now = Date.now()

        const archiveSnapshot = {
          ...(primaryArchiveRecord ?? fallbackSnapshot),
          id: toNonEmptyWorkspaceText(primaryArchiveRecord?.id) || fallbackSnapshot.id,
          repo:
            selectedRepository ||
            toNonEmptyWorkspaceText(primaryArchiveRecord?.repo) ||
            toNonEmptyWorkspaceText(fallbackSnapshot.repo),
          base:
            toNonEmptyWorkspaceText(primaryArchiveRecord?.base) ||
            toNonEmptyWorkspaceText(githubPrBaseBranch?.value) ||
            toNonEmptyWorkspaceText(fallbackBaseBranch),
          head:
            toNonEmptyWorkspaceText(primaryArchiveRecord?.head) ||
            toNonEmptyWorkspaceText(githubPrHeadBranch?.value) ||
            toNonEmptyWorkspaceText(fallbackHeadBranch),
          prTitle:
            toNonEmptyWorkspaceText(primaryArchiveRecord?.prTitle) ||
            toNonEmptyWorkspaceText(githubPrTitle?.value) ||
            toNonEmptyWorkspaceText(fallbackPrTitle),
          prContextState: nextState,
          prNumber: workspacePrNumber,
          lastModified: now,
        }

        const saved = await workspaceStorage.upsertWorkspace(archiveSnapshot)

        const staleActiveRecordIds = activeRecordsForContext
          .map(record => toNonEmptyWorkspaceText(record.id))
          .filter(recordId => recordId && recordId !== toNonEmptyWorkspaceText(saved?.id))

        if (staleActiveRecordIds.length > 0) {
          await Promise.all(
            staleActiveRecordIds.map(recordId =>
              workspaceStorage.removeWorkspace(recordId),
            ),
          )
        }

        await refreshLocalContextOptions()
      } catch (error) {
        await freshWorkspaceTransition
        const message =
          error instanceof Error
            ? error.message
            : 'Could not archive the previous pull request workspace.'
        setStatus(
          `Switched to a fresh local workspace, but archive persistence failed: ${message}`,
          'error',
        )
      }
    }

    void runArchiveHandoff()
  }

  return {
    setLastKnownPrContextMeta: nextValue => {
      if (!nextValue || typeof nextValue !== 'object') {
        lastKnownPrContextMeta = null
        return
      }

      lastKnownPrContextMeta = {
        baseBranch: typeof nextValue.baseBranch === 'string' ? nextValue.baseBranch : '',
        headBranch: typeof nextValue.headBranch === 'string' ? nextValue.headBranch : '',
        prTitle: typeof nextValue.prTitle === 'string' ? nextValue.prTitle : '',
      }
    },
    archivePrWorkspaceAndStartFreshLocal,
    startFreshLocalWorkspace,
  }
}
