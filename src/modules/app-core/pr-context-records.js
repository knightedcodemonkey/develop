const persistClosedPrContextRecords = async ({
  workspaceStorage,
  selectedRepository,
  nextPrNumber,
  normalizedHead,
  toNonEmptyWorkspaceText,
  refreshLocalContextOptions,
}) => {
  const siblingRecords = selectedRepository
    ? await workspaceStorage.listWorkspaces({ repo: selectedRepository })
    : await workspaceStorage.listWorkspaces()

  const activeRecordsForContext = siblingRecords.filter(record => {
    if (!record || typeof record !== 'object') {
      return false
    }

    if (toNonEmptyWorkspaceText(record.prContextState).toLowerCase() !== 'active') {
      return false
    }

    const hasMatchingPrNumber =
      typeof nextPrNumber === 'number' &&
      Number.isFinite(nextPrNumber) &&
      typeof record.prNumber === 'number' &&
      Number.isFinite(record.prNumber) &&
      record.prNumber === nextPrNumber

    const hasMatchingHead =
      normalizedHead && toNonEmptyWorkspaceText(record.head) === normalizedHead

    return hasMatchingPrNumber || hasMatchingHead
  })

  if (activeRecordsForContext.length === 0) {
    return
  }

  const now = Date.now()
  await Promise.all(
    activeRecordsForContext.map(record =>
      workspaceStorage.upsertWorkspace({
        ...record,
        prContextState: 'closed',
        prNumber: nextPrNumber,
        lastModified: now,
      }),
    ),
  )

  await refreshLocalContextOptions()
}

export { persistClosedPrContextRecords }
