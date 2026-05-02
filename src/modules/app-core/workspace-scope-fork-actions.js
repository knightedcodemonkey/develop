const toWorkspaceScopeMarker = value => (value === 'repository' ? 'repository' : 'local')

const createForkedHeadBranchName = ({ currentHead, toNonEmptyWorkspaceText }) => {
  const normalizedHead = toNonEmptyWorkspaceText(currentHead)
  const baseHead = normalizedHead || `feat/component-${Date.now().toString(36)}`
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${baseHead}-${suffix}`
}

export const createWorkspaceScopeForkActions = ({
  toNonEmptyWorkspaceText,
  workspaceStorage,
  flushWorkspaceSave,
  refreshLocalContextOptions,
  createWorkspaceRecordId,
  buildWorkspaceRecordSnapshot,
  toWorkspaceRecordKey,
  getWorkspacePrContextState,
  setWorkspacePrContextState,
  setWorkspacePrNumber,
  getActiveWorkspaceRecordId,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  getWorkspaceRepositoryFullName,
  setWorkspaceRepositoryFullName,
  setWorkspaceScopeMarker,
  setHeadBranchValue,
  setPrTitleValue,
}) => {
  const syncActiveWorkspaceRepositoryScope = async (
    repositoryFullName,
    { rekeyRecord = false } = {},
  ) => {
    if (
      toNonEmptyWorkspaceText(getWorkspacePrContextState()).toLowerCase() !== 'inactive'
    ) {
      return
    }

    const activeWorkspaceRecordId = toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
    if (!activeWorkspaceRecordId) {
      return
    }

    if (rekeyRecord) {
      await flushWorkspaceSave({ preserveRecordId: true })
      setActiveWorkspaceRecordId('')
      setActiveWorkspaceCreatedAt(null)
    }

    const normalizedRepositoryFullName = toNonEmptyWorkspaceText(repositoryFullName)
    setWorkspaceRepositoryFullName(normalizedRepositoryFullName)
    setWorkspaceScopeMarker(
      toWorkspaceScopeMarker(normalizedRepositoryFullName ? 'repository' : 'local'),
    )
    await flushWorkspaceSave({
      preserveRecordId: !rekeyRecord,
      allowIdentityMutation: true,
    })
  }

  const setActiveWorkspaceScopeMarker = async nextScope => {
    if (
      toNonEmptyWorkspaceText(getWorkspacePrContextState()).toLowerCase() !== 'inactive'
    ) {
      return
    }

    const activeWorkspaceRecordId = toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())
    if (!activeWorkspaceRecordId) {
      return
    }

    const normalizedScope = toWorkspaceScopeMarker(nextScope)

    const activeRecord = await workspaceStorage.getWorkspaceById(activeWorkspaceRecordId)
    if (!activeRecord) {
      return
    }

    const hasPrNumber =
      typeof activeRecord.prNumber === 'number' && Number.isFinite(activeRecord.prNumber)
    if (hasPrNumber) {
      return
    }

    const currentScope =
      typeof activeRecord.workspaceScope === 'string'
        ? activeRecord.workspaceScope.trim().toLowerCase()
        : ''

    if (currentScope === normalizedScope) {
      return
    }

    setWorkspaceScopeMarker(normalizedScope)

    await workspaceStorage.upsertWorkspace({
      ...activeRecord,
      workspaceScope: normalizedScope,
      lastModified: Date.now(),
    })

    await refreshLocalContextOptions()
  }

  const forkWorkspaceFromCurrentState = async repositoryFullName => {
    const normalizedTargetRepository = toNonEmptyWorkspaceText(repositoryFullName)
    const activeWorkspaceRecordId = toNonEmptyWorkspaceText(getActiveWorkspaceRecordId())

    if (activeWorkspaceRecordId) {
      let sourceRepositoryFullName = toNonEmptyWorkspaceText(
        getWorkspaceRepositoryFullName(),
      )

      try {
        const activeWorkspaceRecord = await workspaceStorage.getWorkspaceById(
          activeWorkspaceRecordId,
        )
        sourceRepositoryFullName = toNonEmptyWorkspaceText(activeWorkspaceRecord?.repo)
      } catch {
        /* Save path continues even if source record lookup fails. */
      }

      setWorkspaceRepositoryFullName(sourceRepositoryFullName)
      await flushWorkspaceSave({
        preserveRecordId: true,
        allowDuplicateWorkspaceKey: true,
      })
    }

    setWorkspaceRepositoryFullName(normalizedTargetRepository)
    setWorkspaceScopeMarker(
      toWorkspaceScopeMarker(normalizedTargetRepository ? 'repository' : 'local'),
    )
    setWorkspacePrContextState('inactive')
    setWorkspacePrNumber(null)
    if (typeof setPrTitleValue === 'function') {
      setPrTitleValue('')
    }

    const now = Date.now()
    const nextRecordId = createWorkspaceRecordId()
    const snapshot = buildWorkspaceRecordSnapshot({ recordId: nextRecordId })
    const forkedHeadBranch = createForkedHeadBranchName({
      currentHead: snapshot.head,
      toNonEmptyWorkspaceText,
    })

    setHeadBranchValue(forkedHeadBranch)

    const saved = await workspaceStorage.upsertWorkspace({
      ...snapshot,
      id: nextRecordId,
      supersededId: '',
      workspaceScope: normalizedTargetRepository ? 'repository' : 'local',
      workspaceKey: toWorkspaceRecordKey({
        repositoryFullName: normalizedTargetRepository,
        headBranch: forkedHeadBranch,
      }),
      repo: normalizedTargetRepository,
      head: forkedHeadBranch,
      prTitle: '',
      prContextState: 'inactive',
      prNumber: null,
      createdAt: now,
      lastModified: now,
    })

    const savedId = toNonEmptyWorkspaceText(saved?.id) || nextRecordId
    const savedCreatedAt =
      typeof saved?.createdAt === 'number' && Number.isFinite(saved.createdAt)
        ? saved.createdAt
        : now
    setActiveWorkspaceRecordId(savedId)
    setActiveWorkspaceCreatedAt(savedCreatedAt)

    await refreshLocalContextOptions()
  }

  return {
    forkWorkspaceFromCurrentState,
    setActiveWorkspaceScopeMarker,
    syncActiveWorkspaceRepositoryScope,
  }
}
