const persistClosedPrContextRecords = async ({
  workspaceStorage,
  selectedRepository,
  nextPrNumber,
  normalizedHead,
  fallbackPrTitle,
  toNonEmptyWorkspaceText,
  refreshLocalContextOptions,
}) => {
  const siblingRecords = selectedRepository
    ? await workspaceStorage.listWorkspaces({ repo: selectedRepository })
    : await workspaceStorage.listWorkspaces()

  const recordsForContext = siblingRecords.filter(record => {
    if (!record || typeof record !== 'object') {
      return false
    }

    const normalizedState = toNonEmptyWorkspaceText(record.prContextState).toLowerCase()
    if (normalizedState !== 'active' && normalizedState !== 'closed') {
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

  if (recordsForContext.length === 0) {
    return
  }

  const normalizedFallbackTitle = toNonEmptyWorkspaceText(fallbackPrTitle)
  const now = Date.now()
  await Promise.all(
    recordsForContext.map(record => {
      const preservedTitle =
        toNonEmptyWorkspaceText(record.prTitle) || normalizedFallbackTitle

      return workspaceStorage.upsertWorkspace({
        ...record,
        prContextState: 'closed',
        prNumber: nextPrNumber,
        prTitle: preservedTitle,
        lastModified: now,
      })
    }),
  )

  await refreshLocalContextOptions()
}

export { persistClosedPrContextRecords }
