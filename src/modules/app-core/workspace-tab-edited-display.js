const isTabEditedForDisplay = tab => {
  if (!tab || typeof tab !== 'object' || tab.isDirty !== true) {
    return false
  }

  const nextContent = typeof tab.content === 'string' ? tab.content : ''
  const syncedContent = typeof tab.syncedContent === 'string' ? tab.syncedContent : null

  if (syncedContent !== null) {
    return nextContent !== syncedContent
  }

  const hasSyncTimestamp =
    typeof tab.syncedAt === 'number' && Number.isFinite(tab.syncedAt) && tab.syncedAt > 0
  const hasSyncSha =
    typeof tab.lastSyncedRemoteSha === 'string' && tab.lastSyncedRemoteSha.trim()

  return Boolean(hasSyncTimestamp || hasSyncSha)
}

export { isTabEditedForDisplay }
