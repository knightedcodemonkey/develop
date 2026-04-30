const defaultCommitMessage = 'chore: sync editor updates from @knighted/develop'

const supportedRenderModes = new Set(['dom', 'react'])
const supportedStyleModes = new Set(['css', 'module', 'less', 'sass'])
const supportedPrContextStates = new Set(['inactive', 'active', 'closed'])

const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const toPullRequestNumber = value => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  return null
}

const normalizeRenderMode = value => {
  const mode = toSafeText(value).toLowerCase()
  return supportedRenderModes.has(mode) ? mode : 'dom'
}

const normalizeStyleMode = value => {
  const mode = toSafeText(value).toLowerCase()
  return supportedStyleModes.has(mode) ? mode : 'css'
}

const normalizePrContextState = value => {
  const state = toSafeText(value).toLowerCase()
  if (state === 'disconnected') {
    return 'inactive'
  }

  return supportedPrContextStates.has(state) ? state : 'inactive'
}

const sanitizeBranchPart = value => {
  const trimmed = toSafeText(value)
  if (!trimmed) {
    return ''
  }

  return trimmed
    .replace(/[^A-Za-z0-9._/-]/g, '-')
    .replace(/\/+/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/^[-/.]+|[-/.]+$/g, '')
}

export {
  defaultCommitMessage,
  normalizePrContextState,
  normalizeRenderMode,
  normalizeStyleMode,
  sanitizeBranchPart,
  toPullRequestNumber,
  toSafeText,
}
