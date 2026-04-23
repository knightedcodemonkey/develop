const defaultStyleTabLanguages = new Set(['css', 'less', 'sass', 'module'])
const defaultComponentTabPath = 'src/components/App.tsx'
const defaultComponentTabName = 'App.tsx'
const defaultEntryTabDirectory = 'src/components'
const defaultAllowedEntryTabFileNames = new Set(['app.tsx', 'app.js'])

const toNonEmptyWorkspaceText = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''

const toWorkspaceIdentitySegment = value => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!normalized) {
    return ''
  }

  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const toWorkspaceRecordId = ({ repositoryFullName, headBranch }) => {
  const repoSegment = toWorkspaceIdentitySegment(repositoryFullName)
  const headSegment = toWorkspaceIdentitySegment(headBranch) || 'draft'

  if (repoSegment) {
    return `repo_${repoSegment}_${headSegment}`
  }

  return `workspace_${headSegment}`
}

const resolveWorkspaceRecordIdentity = ({
  repositoryFullName,
  headBranch,
  activeRecordId,
  prContextState,
} = {}) => {
  const canonicalId = toWorkspaceRecordId({ repositoryFullName, headBranch })
  const currentId = toNonEmptyWorkspaceText(activeRecordId)
  const normalizedPrContextState = toNonEmptyWorkspaceText(prContextState).toLowerCase()
  const isActivePrContext = normalizedPrContextState === 'active'

  if (!currentId) {
    return {
      id: canonicalId,
      supersededId: '',
    }
  }

  if (currentId === canonicalId) {
    return {
      id: currentId,
      supersededId: '',
    }
  }

  const hasRepository = Boolean(toWorkspaceIdentitySegment(repositoryFullName))
  const shouldPromoteLocalIdToRepository =
    hasRepository && currentId.startsWith('workspace_')

  if (shouldPromoteLocalIdToRepository) {
    return {
      id: canonicalId,
      supersededId: currentId,
    }
  }

  const shouldRekeyRepositoryIdentity =
    hasRepository && isActivePrContext && currentId.startsWith('repo_')

  if (shouldRekeyRepositoryIdentity) {
    return {
      id: canonicalId,
      supersededId: currentId,
    }
  }

  return {
    id: currentId,
    supersededId: '',
  }
}

const toWorkspaceSyncTimestamp = value =>
  Number.isFinite(value) && value > 0 ? Math.max(0, Number(value)) : null

const toWorkspaceSyncSha = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null

const toWorkspaceSyncedContent = value => (typeof value === 'string' ? value : null)

const normalizeWorkspacePathValue = value =>
  toNonEmptyWorkspaceText(value).replace(/\\/g, '/').replace(/\/+/g, '/')

const getTabTargetPrFilePath = tab => normalizeWorkspacePathValue(tab?.targetPrFilePath)

const hasTabSyncBaseline = tab =>
  Boolean(
    getTabTargetPrFilePath(tab) ||
    toWorkspaceSyncTimestamp(tab?.syncedAt) ||
    toWorkspaceSyncSha(tab?.lastSyncedRemoteSha),
  )

const hasTabCommittedSyncState = tab =>
  Boolean(
    toWorkspaceSyncTimestamp(tab?.syncedAt) ||
    toWorkspaceSyncSha(tab?.lastSyncedRemoteSha) ||
    toWorkspaceSyncedContent(tab?.syncedContent),
  )

const getDirtyStateForTabChange = (tab, nextContent) => {
  if (!hasTabSyncBaseline(tab)) {
    return Boolean(tab?.isDirty)
  }

  const normalizedNextContent = typeof nextContent === 'string' ? nextContent : ''
  const syncedContent = toWorkspaceSyncedContent(tab?.syncedContent)

  if (syncedContent === null) {
    if (normalizedNextContent === (typeof tab?.content === 'string' ? tab.content : '')) {
      return Boolean(tab?.isDirty)
    }

    return true
  }

  return normalizedNextContent !== syncedContent
}

const resolveSyncedBaselineContent = ({ tab, content }) => {
  const explicitSyncedContent = toWorkspaceSyncedContent(tab?.syncedContent)
  if (explicitSyncedContent !== null) {
    return explicitSyncedContent
  }

  if (hasTabSyncBaseline(tab) && !tab?.isDirty) {
    return content
  }

  return null
}

const isStyleTabLanguage = (
  language,
  { styleTabLanguages = defaultStyleTabLanguages } = {},
) => styleTabLanguages.has(toNonEmptyWorkspaceText(language))

const getTabKind = (tab, options) =>
  isStyleTabLanguage(tab?.language, options) ? 'styles' : 'component'

const splitWorkspacePath = value => {
  const normalized = toNonEmptyWorkspaceText(value)
  if (!normalized) {
    return []
  }

  return normalized.split(/[\\/]+/).filter(Boolean)
}

const getPathFileName = path => {
  const segments = splitWorkspacePath(path)
  return segments.length > 0 ? segments[segments.length - 1] : ''
}

const getPathDirectory = (path, { defaultDirectory = defaultEntryTabDirectory } = {}) => {
  const segments = splitWorkspacePath(path)
  if (segments.length <= 1) {
    return defaultDirectory
  }

  return segments.slice(0, -1).join('/')
}

const normalizeEntryTabName = (
  value,
  {
    allowedEntryTabFileNames = defaultAllowedEntryTabFileNames,
    defaultFileName = defaultComponentTabName,
  } = {},
) => {
  const normalized = toNonEmptyWorkspaceText(value)
  if (allowedEntryTabFileNames.has(normalized.toLowerCase())) {
    return normalized
  }

  return defaultFileName
}

const getWorkspaceTabDisplay = tab => {
  const fullPath =
    toNonEmptyWorkspaceText(tab?.path) || toNonEmptyWorkspaceText(tab?.name)
  const explicitName = toNonEmptyWorkspaceText(tab?.name)
  const explicitFileName = getPathFileName(explicitName)
  return {
    fileName: explicitFileName || explicitName || getPathFileName(fullPath),
    fullPath,
  }
}

const normalizeEntryTabPath = (
  path,
  {
    preferredFileName = '',
    defaultPath = defaultComponentTabPath,
    defaultDirectory = defaultEntryTabDirectory,
    allowedEntryTabFileNames = defaultAllowedEntryTabFileNames,
    defaultFileName = defaultComponentTabName,
  } = {},
) => {
  const normalizedPath = toNonEmptyWorkspaceText(path)
  const directory = getPathDirectory(normalizedPath || defaultPath, {
    defaultDirectory,
  })
  const requestedFileName =
    toNonEmptyWorkspaceText(preferredFileName) ||
    getPathFileName(normalizedPath || defaultPath)
  const fileName = normalizeEntryTabName(requestedFileName, {
    allowedEntryTabFileNames,
    defaultFileName,
  })

  return `${directory}/${fileName}`
}

const normalizeModuleTabPathForRename = (
  path,
  nextName,
  { defaultDirectory = defaultEntryTabDirectory } = {},
) => {
  const currentPath = toNonEmptyWorkspaceText(path)
  const normalizedNextName = toNonEmptyWorkspaceText(nextName)

  if (/[\\/]/.test(normalizedNextName)) {
    return normalizeWorkspacePathValue(normalizedNextName)
  }

  const nextFileName = getPathFileName(normalizedNextName) || normalizedNextName

  if (!nextFileName) {
    return currentPath
  }

  if (!currentPath) {
    return nextFileName
  }

  const directory = getPathDirectory(currentPath, { defaultDirectory })
  return `${directory}/${nextFileName}`
}

const resolveWorkspaceActiveTabId = ({ tabs, requestedActiveTabId }) => {
  const nextTabs = Array.isArray(tabs) ? tabs : []
  const requestedId = toNonEmptyWorkspaceText(requestedActiveTabId)

  if (requestedId && nextTabs.some(tab => tab?.id === requestedId)) {
    return requestedId
  }

  if (nextTabs.some(tab => tab?.id === 'component')) {
    return 'component'
  }

  return toNonEmptyWorkspaceText(nextTabs[0]?.id)
}

export {
  defaultStyleTabLanguages,
  getDirtyStateForTabChange,
  getPathDirectory,
  getPathFileName,
  getTabKind,
  getTabTargetPrFilePath,
  getWorkspaceTabDisplay,
  hasTabCommittedSyncState,
  hasTabSyncBaseline,
  isStyleTabLanguage,
  normalizeEntryTabName,
  normalizeEntryTabPath,
  normalizeModuleTabPathForRename,
  normalizeWorkspacePathValue,
  resolveSyncedBaselineContent,
  resolveWorkspaceActiveTabId,
  resolveWorkspaceRecordIdentity,
  splitWorkspacePath,
  toNonEmptyWorkspaceText,
  toWorkspaceIdentitySegment,
  toWorkspaceRecordId,
  toWorkspaceSyncSha,
  toWorkspaceSyncedContent,
  toWorkspaceSyncTimestamp,
}
