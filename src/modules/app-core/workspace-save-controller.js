const createWorkspaceSaveController = ({
  createDebouncedWorkspaceSaver,
  workspaceStorage,
  toNonEmptyWorkspaceText,
  buildWorkspaceRecordSnapshot,
  refreshLocalContextOptions,
  setStatus,
  getIsApplyingWorkspaceSnapshot,
  getActiveWorkspaceRecordId,
  getActiveWorkspaceCreatedAt,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  getHasCompletedInitialWorkspaceBootstrap,
}) => {
  const workspaceSaver = createDebouncedWorkspaceSaver({
    save: async payload => {
      const saved = await workspaceStorage.upsertWorkspace(payload)

      const normalizedSavedRepo = toNonEmptyWorkspaceText(saved.repo)
      const normalizedSavedWorkspaceKey = toNonEmptyWorkspaceText(saved.workspaceKey)

      if (normalizedSavedWorkspaceKey) {
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
                toNonEmptyWorkspaceText(record.workspaceKey) ===
                normalizedSavedWorkspaceKey
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

      const currentActiveRecordId =
        typeof getActiveWorkspaceRecordId === 'function'
          ? toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
          : ''
      const payloadRecordId = toNonEmptyWorkspaceText(payload?.id)
      const savedRecordId = toNonEmptyWorkspaceText(saved.id)
      const shouldAdoptSavedAsActive =
        !currentActiveRecordId ||
        currentActiveRecordId === payloadRecordId ||
        currentActiveRecordId === savedRecordId

      if (shouldAdoptSavedAsActive) {
        setActiveWorkspaceRecordId(saved.id)
        setActiveWorkspaceCreatedAt(saved.createdAt ?? getActiveWorkspaceCreatedAt())
      }

      await refreshLocalContextOptions()
      return saved
    },
    onError: error => {
      const message =
        error instanceof Error ? error.message : 'Could not save local workspace context.'
      setStatus(`Local save failed: ${message}`, 'error')
    },
  })

  const queueWorkspaceSave = ({ preserveRecordId = false } = {}) => {
    if (getIsApplyingWorkspaceSnapshot()) {
      return
    }

    if (
      typeof getHasCompletedInitialWorkspaceBootstrap === 'function' &&
      !getHasCompletedInitialWorkspaceBootstrap()
    ) {
      return
    }

    const activeRecordId =
      preserveRecordId && typeof getActiveWorkspaceRecordId === 'function'
        ? toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
        : ''
    const snapshot = activeRecordId
      ? buildWorkspaceRecordSnapshot({ recordId: activeRecordId })
      : buildWorkspaceRecordSnapshot()
    setActiveWorkspaceRecordId(snapshot.id)
    workspaceSaver.queue(snapshot)
  }

  const flushWorkspaceSave = async ({ preserveRecordId = false } = {}) => {
    if (getIsApplyingWorkspaceSnapshot()) {
      return
    }

    if (
      typeof getHasCompletedInitialWorkspaceBootstrap === 'function' &&
      !getHasCompletedInitialWorkspaceBootstrap()
    ) {
      return
    }

    const activeRecordId =
      preserveRecordId && typeof getActiveWorkspaceRecordId === 'function'
        ? toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
        : ''
    const snapshot = activeRecordId
      ? buildWorkspaceRecordSnapshot({ recordId: activeRecordId })
      : buildWorkspaceRecordSnapshot()
    setActiveWorkspaceRecordId(snapshot.id)
    await workspaceSaver.flushNow(snapshot)
  }

  const bindWorkspaceMetadataPersistence = (
    element,
    {
      preserveRecordIdOnInput = false,
      preserveRecordIdOnChange = false,
      rekeyOnBlur = true,
    } = {},
  ) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return
    }

    const queue = () => {
      queueWorkspaceSave({ preserveRecordId: preserveRecordIdOnInput })
    }

    const queueFromChange = () => {
      queueWorkspaceSave({ preserveRecordId: preserveRecordIdOnChange })
    }

    const flush = () => {
      void flushWorkspaceSave({ preserveRecordId: !rekeyOnBlur }).catch(() => {
        /* Save failures are already surfaced through saver onError. */
      })
    }

    element.addEventListener('input', queue)
    element.addEventListener('change', queueFromChange)
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
