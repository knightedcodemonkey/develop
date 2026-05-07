import {
  decodeWorkspaceSharePayload,
  workspaceShareParam,
} from './workspace-share-codec.js'

const toShareableWorkspaceRecord = ({ snapshot, createWorkspaceRecordId }) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return null
  }

  if (typeof createWorkspaceRecordId !== 'function') {
    throw new Error('Workspace import id generator is unavailable.')
  }

  const nextTabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : []
  if (nextTabs.length === 0) {
    return null
  }

  return {
    ...snapshot,
    id: createWorkspaceRecordId(),
    workspaceScope: 'local',
    repo: '',
    base: '',
    head: '',
    prNumber: null,
    prTitle: '',
    prContextState: 'inactive',
    workspaceKey: '',
    lastModified: Date.now(),
    createdAt: Date.now(),
  }
}

const clearWorkspaceShareParamFromUrl = () => {
  const currentUrl = new URL(window.location.href)
  currentUrl.searchParams.delete(workspaceShareParam)
  window.history.replaceState(window.history.state, '', currentUrl.toString())
}

const createWorkspaceShareUrlImporter = ({
  workspaceStorage,
  applyWorkspaceRecord,
  refreshLocalContextOptions,
  createWorkspaceRecordId,
} = {}) => {
  return async () => {
    const currentUrl = new URL(window.location.href)
    const encodedPayload = currentUrl.searchParams.get(workspaceShareParam)
    if (!encodedPayload) {
      return false
    }

    const decodedSnapshot = await decodeWorkspaceSharePayload(encodedPayload)
    const importedRecord = toShareableWorkspaceRecord({
      snapshot: decodedSnapshot,
      createWorkspaceRecordId,
    })
    if (!importedRecord) {
      throw new Error('Shared workspace payload is missing a valid tab snapshot.')
    }

    const savedWorkspace = await workspaceStorage.upsertWorkspace(importedRecord)
    const didApply = await applyWorkspaceRecord(savedWorkspace, { silent: false })

    if (didApply) {
      clearWorkspaceShareParamFromUrl()
      await refreshLocalContextOptions()
    }

    return didApply
  }
}

export { createWorkspaceShareUrlImporter }
