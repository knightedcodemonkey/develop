import { cdnImports, importFromCdnWithFallback } from '../cdn.js'

const workspaceDbName = 'knighted-develop-workspaces'
const workspaceDbVersion = 1
const workspaceStoreName = 'prWorkspaces'
const workspaceByRepoIndexName = 'byRepo'
const workspaceByLastModifiedIndexName = 'byLastModified'

const toTabRole = value => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized === 'entry' ? 'entry' : 'module'
}

const normalizeRenderMode = value => (value === 'react' ? 'react' : 'dom')

const toSyncTimestamp = value =>
  Number.isFinite(value) && value > 0 ? Math.max(0, Number(value)) : null

const toSyncSha = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null

const toTargetPrFilePath = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null

const toSyncedContent = value => (typeof value === 'string' ? value : null)

const normalizeTabRecord = tab => {
  if (!tab || typeof tab !== 'object') {
    return null
  }

  const tabId =
    typeof tab.id === 'string' && tab.id.length > 0
      ? tab.id
      : typeof tab.path === 'string' && tab.path.length > 0
        ? tab.path
        : null

  if (!tabId) {
    return null
  }

  return {
    id: tabId,
    name: typeof tab.name === 'string' ? tab.name : tabId,
    path: typeof tab.path === 'string' ? tab.path : '',
    language: typeof tab.language === 'string' ? tab.language : 'plaintext',
    role: toTabRole(tab.role),
    isActive: Boolean(tab.isActive),
    scroll: Number.isFinite(tab.scroll) ? Math.max(0, tab.scroll) : 0,
    content: typeof tab.content === 'string' ? tab.content : '',
    targetPrFilePath: toTargetPrFilePath(tab.targetPrFilePath),
    isDirty: Boolean(tab.isDirty),
    syncedAt: toSyncTimestamp(tab.syncedAt),
    lastSyncedRemoteSha: toSyncSha(tab.lastSyncedRemoteSha),
    syncedContent: toSyncedContent(tab.syncedContent),
    lastModified: Number.isFinite(tab.lastModified) ? tab.lastModified : Date.now(),
  }
}

const normalizeWorkspaceRecord = record => {
  if (!record || typeof record !== 'object') {
    throw new TypeError('Workspace record must be an object.')
  }

  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new TypeError('Workspace record id must be a non-empty string.')
  }

  const normalizedTabs = Array.isArray(record.tabs)
    ? record.tabs.map(normalizeTabRecord).filter(Boolean)
    : []

  return {
    id: record.id,
    repo: typeof record.repo === 'string' ? record.repo : '',
    base: typeof record.base === 'string' ? record.base : '',
    head: typeof record.head === 'string' ? record.head : '',
    prNumber:
      typeof record.prNumber === 'number' && Number.isFinite(record.prNumber)
        ? record.prNumber
        : null,
    prTitle: typeof record.prTitle === 'string' ? record.prTitle : '',
    prContextState:
      typeof record.prContextState === 'string' && record.prContextState.trim().length > 0
        ? record.prContextState.trim()
        : 'inactive',
    renderMode: normalizeRenderMode(record.renderMode),
    tabs: normalizedTabs,
    activeTabId: typeof record.activeTabId === 'string' ? record.activeTabId : null,
    schemaVersion:
      typeof record.schemaVersion === 'number' && Number.isFinite(record.schemaVersion)
        ? record.schemaVersion
        : workspaceDbVersion,
    lastModified:
      typeof record.lastModified === 'number' && Number.isFinite(record.lastModified)
        ? record.lastModified
        : Date.now(),
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now(),
  }
}

const loadIdbRuntime = async () => {
  const loaded = await importFromCdnWithFallback(cdnImports.idb)
  const { openDB } = loaded.module ?? {}

  if (typeof openDB !== 'function') {
    throw new Error('idb module did not expose openDB().')
  }

  return { openDB }
}

const openWorkspaceDb = async ({ loadRuntime } = {}) => {
  const runtime = loadRuntime ?? loadIdbRuntime
  const { openDB } = await runtime()

  return openDB(workspaceDbName, workspaceDbVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(workspaceStoreName)) {
        const store = db.createObjectStore(workspaceStoreName, {
          keyPath: 'id',
        })
        store.createIndex(workspaceByRepoIndexName, 'repo')
        store.createIndex(workspaceByLastModifiedIndexName, 'lastModified')
      }
    },
  })
}

const byLastModifiedDesc = (a, b) => b.lastModified - a.lastModified

const withLastModifiedNow = record => ({
  ...record,
  lastModified: Date.now(),
})

export const createWorkspaceStorageAdapter = ({ loadRuntime } = {}) => {
  let dbPromise = null

  const ensureDb = () => {
    if (!dbPromise) {
      dbPromise = openWorkspaceDb({ loadRuntime }).catch(error => {
        dbPromise = null
        throw error
      })
    }

    return dbPromise
  }

  const getWorkspaceById = async id => {
    if (typeof id !== 'string' || id.length === 0) {
      return null
    }

    const db = await ensureDb()
    const record = await db.get(workspaceStoreName, id)

    if (!record) {
      return null
    }

    return normalizeWorkspaceRecord(record)
  }

  const listWorkspaces = async ({ repo } = {}) => {
    const db = await ensureDb()
    const hasRepoFilter = typeof repo === 'string' && repo.length > 0

    if (hasRepoFilter) {
      const byRepo = await db.getAllFromIndex(
        workspaceStoreName,
        workspaceByRepoIndexName,
        repo,
      )

      return byRepo.map(normalizeWorkspaceRecord).sort(byLastModifiedDesc)
    }

    const byLastModified = await db.getAllFromIndex(
      workspaceStoreName,
      workspaceByLastModifiedIndexName,
    )

    return byLastModified.map(normalizeWorkspaceRecord).reverse()
  }

  const upsertWorkspace = async record => {
    const normalized = withLastModifiedNow(normalizeWorkspaceRecord(record))
    const db = await ensureDb()

    await db.put(workspaceStoreName, normalized)

    return normalized
  }

  const upsertTabContent = async ({
    workspaceId,
    tabId,
    content,
    scroll,
    isActive,
    name,
    path,
    language,
    role,
    targetPrFilePath,
    isDirty,
    syncedAt,
    lastSyncedRemoteSha,
    syncedContent,
  }) => {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      throw new TypeError('workspaceId must be a non-empty string.')
    }

    if (typeof tabId !== 'string' || tabId.length === 0) {
      throw new TypeError('tabId must be a non-empty string.')
    }

    const workspace = (await getWorkspaceById(workspaceId)) ?? {
      id: workspaceId,
      tabs: [],
      schemaVersion: workspaceDbVersion,
      createdAt: Date.now(),
      lastModified: Date.now(),
    }

    const previousTabs = Array.isArray(workspace.tabs) ? workspace.tabs : []
    const nextTabs = [...previousTabs]
    const existingIndex = nextTabs.findIndex(tab => tab.id === tabId)
    const previous = existingIndex >= 0 ? nextTabs[existingIndex] : null

    const nextTabRecord = {
      ...(previous ?? {}),
      id: tabId,
      lastModified: Date.now(),
    }

    if (name !== undefined) {
      nextTabRecord.name = name
    }

    if (path !== undefined) {
      nextTabRecord.path = path
    }

    if (language !== undefined) {
      nextTabRecord.language = language
    }

    if (role !== undefined) {
      nextTabRecord.role = role
    }

    if (targetPrFilePath !== undefined) {
      nextTabRecord.targetPrFilePath = targetPrFilePath
    }

    if (isDirty !== undefined) {
      nextTabRecord.isDirty = isDirty
    }

    if (syncedAt !== undefined) {
      nextTabRecord.syncedAt = syncedAt
    }

    if (lastSyncedRemoteSha !== undefined) {
      nextTabRecord.lastSyncedRemoteSha = lastSyncedRemoteSha
    }

    if (syncedContent !== undefined) {
      nextTabRecord.syncedContent = syncedContent
    }

    if (content !== undefined) {
      nextTabRecord.content = content
    }

    if (scroll !== undefined) {
      nextTabRecord.scroll = scroll
    }

    if (isActive !== undefined) {
      nextTabRecord.isActive = isActive
    }

    const next = normalizeTabRecord(nextTabRecord)

    if (!next) {
      throw new Error('Unable to persist tab content because tab record is invalid.')
    }

    if (existingIndex >= 0) {
      nextTabs[existingIndex] = next
    } else {
      nextTabs.push(next)
    }

    const shouldSwitchActive = typeof isActive === 'boolean' ? isActive : false
    const nextActiveTabId = shouldSwitchActive
      ? tabId
      : typeof workspace.activeTabId === 'string'
        ? workspace.activeTabId
        : null

    return upsertWorkspace({
      ...workspace,
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
    })
  }

  const removeWorkspace = async id => {
    if (typeof id !== 'string' || id.length === 0) {
      return false
    }

    const db = await ensureDb()
    await db.delete(workspaceStoreName, id)

    return true
  }

  const close = async () => {
    if (!dbPromise) {
      return
    }

    const db = await dbPromise
    db.close()
    dbPromise = null
  }

  return {
    getWorkspaceById,
    listWorkspaces,
    upsertWorkspace,
    upsertTabContent,
    removeWorkspace,
    close,
  }
}

export const createDebouncedWorkspaceSaver = ({
  save,
  onError,
  waitMs = 800,
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) => {
  if (typeof save !== 'function') {
    throw new TypeError('save must be a function.')
  }

  let timer = null
  let pendingPayload = null
  let inFlight = Promise.resolve()
  let lastScheduledAt = 0

  const reportSaveError = ({ error, payload }) => {
    if (typeof onError !== 'function') {
      return
    }

    try {
      onError(error, payload)
    } catch {
      /* Swallow reporter failures so saving can continue. */
    }
  }

  const flush = async () => {
    if (!pendingPayload) {
      return
    }

    const payload = pendingPayload
    pendingPayload = null

    const continueChain = inFlight.catch(() => undefined)
    inFlight = continueChain.then(() => save(payload))

    try {
      await inFlight
    } catch (error) {
      reportSaveError({ error, payload })
      throw error
    }
  }

  const queue = payload => {
    pendingPayload = payload
    lastScheduledAt = now()

    if (timer) {
      cancel(timer)
    }

    timer = schedule(async () => {
      timer = null
      try {
        await flush()
      } catch {
        /* Background flush errors are surfaced through onError when provided. */
      }
    }, waitMs)
  }

  const flushNow = async payload => {
    if (payload !== undefined) {
      pendingPayload = payload
    }

    if (timer) {
      cancel(timer)
      timer = null
    }

    await flush()
  }

  const dispose = () => {
    if (timer) {
      cancel(timer)
      timer = null
    }

    pendingPayload = null
  }

  return {
    queue,
    flushNow,
    dispose,
    getLastScheduledAt: () => lastScheduledAt,
  }
}
