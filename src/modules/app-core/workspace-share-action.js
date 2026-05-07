import {
  encodeWorkspaceSharePayload,
  isNativeWorkspaceShareCodecSupported,
  workspaceShareParam,
} from './workspace-share-codec.js'

const defaultMaxWorkspaceShareUrlLength = 8000

const createShareCurrentLocalWorkspace = ({
  clipboardSupported,
  getWorkspaceScopeMarker,
  flushWorkspaceSave,
  buildWorkspaceRecordSnapshot,
  setStatus,
  showAppToast,
  maxWorkspaceShareUrlLength = defaultMaxWorkspaceShareUrlLength,
} = {}) => {
  return async () => {
    if (!clipboardSupported) {
      throw new Error('Clipboard API is not available in this browser context.')
    }

    if (!isNativeWorkspaceShareCodecSupported()) {
      throw new Error('Native compression is not supported in this browser context.')
    }

    if (getWorkspaceScopeMarker?.() !== 'local') {
      throw new Error('Share is only available for local workspaces.')
    }

    await flushWorkspaceSave({ preserveRecordId: true })
    const snapshot = buildWorkspaceRecordSnapshot()
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Could not prepare workspace snapshot.')
    }

    const encodedPayload = await encodeWorkspaceSharePayload(snapshot)
    const sharedUrl = new URL(window.location.href)
    sharedUrl.searchParams.set(workspaceShareParam, encodedPayload)
    const sharedUrlText = sharedUrl.toString()

    if (sharedUrlText.length > maxWorkspaceShareUrlLength) {
      throw new Error('Workspace is too large for a URL.')
    }

    await navigator.clipboard.writeText(sharedUrlText)
    setStatus('Share link copied', 'neutral')
    showAppToast('Share link copied to clipboard.')
  }
}

export { createShareCurrentLocalWorkspace }
