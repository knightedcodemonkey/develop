const createWorkspaceSaveController = ({
  createDebouncedWorkspaceSaver,
  workspaceStorage,
  toNonEmptyWorkspaceText,
  buildWorkspaceRecordSnapshot,
  refreshLocalContextOptions,
  setStatus,
  getIsApplyingWorkspaceSnapshot,
  getActiveWorkspaceCreatedAt,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  getHasCompletedInitialWorkspaceBootstrap,
}) => {
  const workspaceSaver = createDebouncedWorkspaceSaver({
    save: async payload => {
      const saved = await workspaceStorage.upsertWorkspace(payload)

      const normalizedSavedRepo = toNonEmptyWorkspaceText(saved.repo)
      const normalizedSavedHead = toNonEmptyWorkspaceText(saved.head)

      if (normalizedSavedHead) {
        const siblingRecords = normalizedSavedRepo
          ? await workspaceStorage.listWorkspaces({ repo: normalizedSavedRepo })
          : await workspaceStorage.listWorkspaces()

        const duplicateRecordIds = new Set(
          siblingRecords
            .filter(record => {
              if (!record || typeof record !== 'object') {
                return false
              }

              if (
                toNonEmptyWorkspaceText(record.id) === toNonEmptyWorkspaceText(saved.id)
              ) {
                return false
              }

              return (
                toNonEmptyWorkspaceText(record.repo) === normalizedSavedRepo &&
                toNonEmptyWorkspaceText(record.head) === normalizedSavedHead
              )
            })
            .map(record => toNonEmptyWorkspaceText(record.id))
            .filter(Boolean),
        )

        const isSavedActiveContext =
          toNonEmptyWorkspaceText(saved.prContextState).toLowerCase() === 'active'
        const hasSavedPrNumber =
          typeof saved.prNumber === 'number' && Number.isFinite(saved.prNumber)

        if (isSavedActiveContext && hasSavedPrNumber && normalizedSavedRepo) {
          for (const record of siblingRecords) {
            if (!record || typeof record !== 'object') {
              continue
            }

            const recordId = toNonEmptyWorkspaceText(record.id)
            if (!recordId || recordId === toNonEmptyWorkspaceText(saved.id)) {
              continue
            }

            const isRecordActiveContext =
              toNonEmptyWorkspaceText(record.prContextState).toLowerCase() === 'active'
            const hasMatchingPrNumber =
              typeof record.prNumber === 'number' &&
              Number.isFinite(record.prNumber) &&
              record.prNumber === saved.prNumber

            if (
              isRecordActiveContext &&
              hasMatchingPrNumber &&
              toNonEmptyWorkspaceText(record.repo) === normalizedSavedRepo
            ) {
              duplicateRecordIds.add(recordId)
            }
          }
        }

        await Promise.all(
          [...duplicateRecordIds].map(duplicateId =>
            workspaceStorage.removeWorkspace(duplicateId),
          ),
        )
      }

      const supersededId = toNonEmptyWorkspaceText(payload?.supersededId)
      if (supersededId && supersededId !== toNonEmptyWorkspaceText(saved.id)) {
        await workspaceStorage.removeWorkspace(supersededId)
      }

      setActiveWorkspaceRecordId(saved.id)
      setActiveWorkspaceCreatedAt(saved.createdAt ?? getActiveWorkspaceCreatedAt())
      await refreshLocalContextOptions()
      return saved
    },
    onError: error => {
      const message =
        error instanceof Error ? error.message : 'Could not save local workspace context.'
      setStatus(`Local save failed: ${message}`, 'error')
    },
  })

  const queueWorkspaceSave = () => {
    if (getIsApplyingWorkspaceSnapshot()) {
      return
    }

    if (
      typeof getHasCompletedInitialWorkspaceBootstrap === 'function' &&
      !getHasCompletedInitialWorkspaceBootstrap()
    ) {
      return
    }

    const snapshot = buildWorkspaceRecordSnapshot()
    setActiveWorkspaceRecordId(snapshot.id)
    workspaceSaver.queue(snapshot)
  }

  const flushWorkspaceSave = async () => {
    if (getIsApplyingWorkspaceSnapshot()) {
      return
    }

    if (
      typeof getHasCompletedInitialWorkspaceBootstrap === 'function' &&
      !getHasCompletedInitialWorkspaceBootstrap()
    ) {
      return
    }

    const snapshot = buildWorkspaceRecordSnapshot()
    setActiveWorkspaceRecordId(snapshot.id)
    await workspaceSaver.flushNow(snapshot)
  }

  const bindWorkspaceMetadataPersistence = element => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return
    }

    const queue = () => {
      queueWorkspaceSave()
    }

    const flush = () => {
      void flushWorkspaceSave().catch(() => {
        /* Save failures are already surfaced through saver onError. */
      })
    }

    element.addEventListener('input', queue)
    element.addEventListener('change', queue)
    element.addEventListener('blur', flush)
  }

  const dispose = () => {
    workspaceSaver?.dispose()
  }

  return {
    bindWorkspaceMetadataPersistence,
    dispose,
    flushWorkspaceSave,
    queueWorkspaceSave,
  }
}

export { createWorkspaceSaveController }
