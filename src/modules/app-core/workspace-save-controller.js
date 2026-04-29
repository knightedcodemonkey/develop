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
  getActiveWorkspaceLoadTransactionId,
}) => {
  const getCurrentWorkspaceLoadTransactionId = () =>
    typeof getActiveWorkspaceLoadTransactionId === 'function'
      ? getActiveWorkspaceLoadTransactionId()
      : 0

  const canPersistWorkspaceState = () => {
    if (getIsApplyingWorkspaceSnapshot()) {
      return false
    }

    if (
      typeof getHasCompletedInitialWorkspaceBootstrap === 'function' &&
      !getHasCompletedInitialWorkspaceBootstrap()
    ) {
      return false
    }

    return true
  }

  const isStaleSavePayload = payload => {
    if (!payload || typeof payload !== 'object') {
      return true
    }

    if (!canPersistWorkspaceState()) {
      return true
    }

    const payloadTransactionId =
      typeof payload.loadTransactionId === 'number' &&
      Number.isFinite(payload.loadTransactionId)
        ? payload.loadTransactionId
        : -1

    if (payloadTransactionId !== getCurrentWorkspaceLoadTransactionId()) {
      return true
    }

    const payloadRecordId = toNonEmptyWorkspaceText(payload.id)
    const currentActiveRecordId =
      typeof getActiveWorkspaceRecordId === 'function'
        ? toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
        : ''

    if (
      payloadRecordId &&
      currentActiveRecordId &&
      payloadRecordId !== currentActiveRecordId
    ) {
      return true
    }

    return false
  }

  const buildSaveSnapshot = ({
    preserveRecordId = false,
    allowDuplicateWorkspaceKey = false,
  } = {}) => {
    const activeRecordId =
      preserveRecordId && typeof getActiveWorkspaceRecordId === 'function'
        ? toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
        : ''
    const snapshot = activeRecordId
      ? buildWorkspaceRecordSnapshot({ recordId: activeRecordId })
      : buildWorkspaceRecordSnapshot()

    if (allowDuplicateWorkspaceKey) {
      snapshot.allowDuplicateWorkspaceKey = true
    }

    snapshot.loadTransactionId = getCurrentWorkspaceLoadTransactionId()
    return snapshot
  }

  const workspaceSaver = createDebouncedWorkspaceSaver({
    save: async payload => {
      if (isStaleSavePayload(payload)) {
        return null
      }

      const payloadRecordId = toNonEmptyWorkspaceText(payload?.id)
      if (payloadRecordId) {
        const existingRecord = await workspaceStorage.getWorkspaceById(payloadRecordId)
        if (existingRecord && typeof existingRecord === 'object') {
          const existingWorkspaceKey = toNonEmptyWorkspaceText(
            existingRecord.workspaceKey,
          )
          const payloadWorkspaceKey = toNonEmptyWorkspaceText(payload?.workspaceKey)
          if (
            existingWorkspaceKey &&
            payloadWorkspaceKey &&
            existingWorkspaceKey !== payloadWorkspaceKey
          ) {
            const existingWorkspaceScope =
              toNonEmptyWorkspaceText(existingRecord.workspaceScope).toLowerCase() ||
              'local'
            const payloadWorkspaceScope =
              toNonEmptyWorkspaceText(payload?.workspaceScope).toLowerCase() || 'local'
            const existingRepository = toNonEmptyWorkspaceText(existingRecord.repo)
            const payloadRepository = toNonEmptyWorkspaceText(payload?.repo)

            const isLocalToRepositoryRekey =
              existingWorkspaceScope === 'local' &&
              payloadWorkspaceScope === 'repository' &&
              !existingRepository &&
              Boolean(payloadRepository)

            if (!isLocalToRepositoryRekey) {
              return null
            }
          }
        }
      }

      const { loadTransactionId: _loadTransactionId, ...persistablePayload } = payload

      const allowDuplicateWorkspaceKey =
        persistablePayload && typeof persistablePayload === 'object'
          ? persistablePayload.allowDuplicateWorkspaceKey === true
          : false
      const saved = await workspaceStorage.upsertWorkspace(persistablePayload)

      const normalizedSavedRepo = toNonEmptyWorkspaceText(saved.repo)
      const normalizedSavedWorkspaceKey = toNonEmptyWorkspaceText(saved.workspaceKey)
      const normalizedSavedPrContextState =
        toNonEmptyWorkspaceText(saved.prContextState).toLowerCase() || 'inactive'
      const hasSavedPrNumber =
        typeof saved.prNumber === 'number' && Number.isFinite(saved.prNumber)
      const isSavedInactiveWithoutPrNumber =
        normalizedSavedPrContextState === 'inactive' && !hasSavedPrNumber

      if (
        normalizedSavedWorkspaceKey &&
        !allowDuplicateWorkspaceKey &&
        !isSavedInactiveWithoutPrNumber
      ) {
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

        const isSavedActiveContext = normalizedSavedPrContextState === 'active'

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

      const supersededId = toNonEmptyWorkspaceText(persistablePayload?.supersededId)
      if (supersededId && supersededId !== toNonEmptyWorkspaceText(saved.id)) {
        await workspaceStorage.removeWorkspace(supersededId)
      }

      if (isStaleSavePayload(payload)) {
        return saved
      }

      const currentActiveRecordId =
        typeof getActiveWorkspaceRecordId === 'function'
          ? toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
          : ''
      const persistedPayloadRecordId = toNonEmptyWorkspaceText(persistablePayload?.id)
      const savedRecordId = toNonEmptyWorkspaceText(saved.id)
      const shouldAdoptSavedAsActive =
        !currentActiveRecordId ||
        currentActiveRecordId === persistedPayloadRecordId ||
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

  const queueWorkspaceSave = ({
    preserveRecordId = false,
    allowDuplicateWorkspaceKey = false,
  } = {}) => {
    if (!canPersistWorkspaceState()) {
      return
    }

    const snapshot = buildSaveSnapshot({ preserveRecordId, allowDuplicateWorkspaceKey })
    setActiveWorkspaceRecordId(snapshot.id)
    workspaceSaver.queue(snapshot)
  }

  const flushWorkspaceSave = async ({
    preserveRecordId = false,
    allowDuplicateWorkspaceKey = false,
  } = {}) => {
    if (!canPersistWorkspaceState()) {
      return
    }

    const snapshot = buildSaveSnapshot({ preserveRecordId, allowDuplicateWorkspaceKey })
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

  const cancelPendingWorkspaceSave = () => {
    workspaceSaver?.dispose()
  }

  const dispose = () => {
    workspaceSaver?.dispose()
  }

  return {
    bindWorkspaceMetadataPersistence,
    cancelPendingWorkspaceSave,
    dispose,
    flushWorkspaceSave,
    queueWorkspaceSave,
  }
}

export { createWorkspaceSaveController }
