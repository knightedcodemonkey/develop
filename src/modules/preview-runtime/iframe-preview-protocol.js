export const previewProtocolVersion = 1

export const previewProtocolMessageTypes = {
  ready: 'ready',
  init: 'init',
  configPatch: 'config-patch',
  rendered: 'rendered',
  runtimeError: 'runtime-error',
}

const isObject = value => typeof value === 'object' && value !== null

export const createPreviewChannelId = () =>
  `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const toPreviewProtocolMessage = ({ channelId, type, payload = {} }) => ({
  __knightedPreview: true,
  version: previewProtocolVersion,
  channelId,
  type,
  ...payload,
})

export const isPreviewProtocolMessage = ({ data, channelId = '' }) => {
  if (!isObject(data) || data.__knightedPreview !== true) {
    return false
  }

  if (
    typeof data.version !== 'number' ||
    data.version !== previewProtocolVersion ||
    typeof data.type !== 'string'
  ) {
    return false
  }

  if (
    typeof channelId === 'string' &&
    channelId.length > 0 &&
    data.channelId !== channelId
  ) {
    return false
  }

  return true
}

export const createPreviewInitPayload = ({
  mode,
  entrySpecifier,
  entryExportName,
  runtimeSpecifiers,
  cssText,
  hostPadding,
  backgroundColor,
  importMap,
  parentOrigin,
}) => ({
  mode,
  entrySpecifier,
  entryExportName,
  runtimeSpecifiers,
  cssText,
  hostPadding,
  backgroundColor,
  importMap,
  parentOrigin,
})
