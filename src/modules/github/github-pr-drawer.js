import {
  closeRepositoryPullRequest,
  commitEditorContentToExistingBranch,
  createEditorContentPullRequest,
  findOpenRepositoryPullRequestByHead,
  getRepositoryPullRequest,
  listRepositoryBranches,
} from './github-api.js'
import {
  formatActivePrReference,
  parsePullRequestNumberFromUrl,
} from './github-pr-context.js'
import {
  isFunctionLikeDeclaration,
  isFunctionLikeVariableInitializer,
} from '../preview/jsx-top-level-declarations.js'

const prConfigStoragePrefix = 'knighted:develop:github-pr-config:'

const defaultCommitMessage = 'chore: sync editor updates from @knighted/develop'

const supportedRenderModes = new Set(['dom', 'react'])
const supportedStyleModes = new Set(['css', 'module', 'less', 'sass'])

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

const getRepositoryPrConfigStorageKey = repositoryFullName =>
  `${prConfigStoragePrefix}${repositoryFullName}`

const pruneRepositoryPrConfigs = repositoryFullName => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return
  }

  const activeStorageKey = getRepositoryPrConfigStorageKey(repositoryFullName)

  try {
    const keysToRemove = []

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(prConfigStoragePrefix)) {
        continue
      }

      if (key !== activeStorageKey) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    /* noop */
  }
}

const readRepositoryPrConfig = repositoryFullName => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return {}
  }

  try {
    const value = localStorage.getItem(
      getRepositoryPrConfigStorageKey(repositoryFullName),
    )
    if (!value) {
      return {}
    }

    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveRepositoryPrConfig = ({ repositoryFullName, config }) => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return
  }

  try {
    const activeStorageKey = getRepositoryPrConfigStorageKey(repositoryFullName)

    localStorage.setItem(activeStorageKey, JSON.stringify(config))

    pruneRepositoryPrConfigs(repositoryFullName)
  } catch {
    /* noop */
  }
}

const sanitizeRepositoryPrConfig = config => {
  const source = config && typeof config === 'object' ? config : {}
  const pullRequestUrl = toSafeText(source.pullRequestUrl)
  const fallbackPullRequestNumber = parsePullRequestNumberFromUrl(pullRequestUrl)
  const pullRequestNumber =
    toPullRequestNumber(source.pullRequestNumber) ?? fallbackPullRequestNumber

  return {
    baseBranch: toSafeText(source.baseBranch),
    headBranch: sanitizeBranchPart(source.headBranch),
    prTitle: toSafeText(source.prTitle),
    prBody: typeof source.prBody === 'string' ? source.prBody.trim() : '',
    renderMode: normalizeRenderMode(source.renderMode),
    styleMode: normalizeStyleMode(source.styleMode),
    isActivePr: source.isActivePr === true,
    pullRequestNumber,
    pullRequestUrl,
  }
}

const removeRepositoryPrConfig = repositoryFullName => {
  if (typeof repositoryFullName !== 'string' || !repositoryFullName.trim()) {
    return
  }

  try {
    localStorage.removeItem(getRepositoryPrConfigStorageKey(repositoryFullName))
  } catch {
    /* noop */
  }
}

const getActiveRepositoryPrContext = repositoryFullName => {
  const savedConfig = readRepositoryPrConfig(repositoryFullName)

  if (savedConfig?.isActivePr !== true) {
    return null
  }

  const headBranch = sanitizeBranchPart(savedConfig.headBranch)
  const prTitle = toSafeText(savedConfig.prTitle)
  const baseBranch = toSafeText(savedConfig.baseBranch)

  if (!headBranch || !prTitle) {
    return null
  }

  return {
    headBranch,
    renderMode: normalizeRenderMode(savedConfig.renderMode),
    styleMode: normalizeStyleMode(savedConfig.styleMode),
    prTitle,
    prBody: typeof savedConfig.prBody === 'string' ? savedConfig.prBody : '',
    baseBranch,
    pullRequestNumber:
      typeof savedConfig.pullRequestNumber === 'number' &&
      Number.isFinite(savedConfig.pullRequestNumber)
        ? savedConfig.pullRequestNumber
        : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl),
    pullRequestUrl:
      typeof savedConfig.pullRequestUrl === 'string' ? savedConfig.pullRequestUrl : '',
    repositoryFullName,
  }
}

export const findRepositoryWithActivePrContext = repositories => {
  if (!Array.isArray(repositories) || repositories.length === 0) {
    return null
  }

  for (const repository of repositories) {
    const repositoryFullName = toSafeText(repository?.fullName)

    if (!repositoryFullName) {
      continue
    }

    if (getActiveRepositoryPrContext(repositoryFullName)) {
      return repositoryFullName
    }
  }

  return null
}

const normalizeFilePath = value =>
  toSafeText(value).replace(/\\/g, '/').replace(/\/+/g, '/')

const validateFilePath = value => {
  const path = normalizeFilePath(value)

  if (!path) {
    return { ok: false, reason: 'File path is required.' }
  }

  if (path.startsWith('/')) {
    return {
      ok: false,
      reason: 'File path must be repository-relative (no leading slash).',
    }
  }

  if (path.endsWith('/')) {
    return { ok: false, reason: 'File path must include a filename (no trailing slash).' }
  }

  const segments = path.split('/').filter(Boolean)

  if (segments.some(segment => segment === '..')) {
    return { ok: false, reason: 'File path cannot include parent directory traversal.' }
  }

  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) {
    return {
      ok: false,
      reason:
        'File path contains unsupported characters. Use letters, numbers, ., _, -, and / only.',
    }
  }

  if (segments.length === 0 || segments.some(segment => segment === '.' || !segment)) {
    return { ok: false, reason: 'File path is invalid.' }
  }

  return { ok: true, value: path }
}

const normalizeFileCommits = fileCommits => {
  if (!Array.isArray(fileCommits)) {
    return {
      fileCommits: [],
      invalidPaths: [],
    }
  }

  const dedupedByPath = new Map()
  const invalidPathsByKey = new Map()

  for (const item of fileCommits) {
    const pathValidation = validateFilePath(item?.path)
    if (!pathValidation.ok) {
      const rawPath = toSafeText(item?.path)
      const tabLabel = toSafeText(item?.tabLabel)
      const displayPath = rawPath || '(missing path)'
      const key = `${displayPath}|${pathValidation.reason}`

      if (!invalidPathsByKey.has(key)) {
        invalidPathsByKey.set(key, {
          path: displayPath,
          tabLabel,
          reason: pathValidation.reason,
        })
      }

      continue
    }

    dedupedByPath.set(pathValidation.value, {
      path: pathValidation.value,
      content: typeof item?.content === 'string' ? item.content : '',
      tabLabel: toSafeText(item?.tabLabel),
      isEntry: item?.isEntry === true,
    })
  }

  return {
    fileCommits: [...dedupedByPath.values()],
    invalidPaths: [...invalidPathsByKey.values()],
  }
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

const createBranchEntropySuffix = () => Math.random().toString(36).slice(2, 6)

const isAutoGeneratedHeadBranch = value => {
  const branch = sanitizeBranchPart(value)
  if (!branch) {
    return false
  }

  return /^feat\/component-[a-z0-9]{4}(?:-\d+)?$/.test(branch)
}

const createDefaultBranchName = () => {
  const entropy = createBranchEntropySuffix()
  return `feat/component-${entropy}`
}

const buildSummary = ({
  repository,
  baseBranch,
  headBranch,
  fileCommits,
  prTitle,
  commitMessage,
  actionType,
}) => {
  const repositoryLabel = toSafeText(repository?.fullName) || 'No repository selected'
  const isPushCommit = actionType === 'push-commit'

  const lines = [
    `Repository: ${repositoryLabel}`,
    `Head branch: ${headBranch}`,
    `PR title: ${prTitle}`,
    `Commit message: ${commitMessage}`,
  ]

  if (Array.isArray(fileCommits) && fileCommits.length > 0) {
    lines.push('Files to commit:')
    for (const fileCommit of fileCommits) {
      const path = toSafeText(fileCommit?.path)
      if (!path) {
        continue
      }

      const tabLabel = toSafeText(fileCommit?.tabLabel)
      lines.push(tabLabel ? `- ${tabLabel} -> ${path}` : `- ${path}`)
    }
  }

  if (!isPushCommit) {
    lines.splice(1, 0, `Base branch: ${baseBranch}`)
  }

  lines.push('')
  lines.push(
    isPushCommit
      ? 'Proceed with committing editor content to the active pull request branch?'
      : 'Proceed with creating commits and opening this pull request?',
  )

  return lines.join('\n')
}

const toBranchCacheKey = repository => {
  const owner = toSafeText(repository?.owner)
  const name = toSafeText(repository?.name)
  if (!owner || !name) {
    return ''
  }

  return `${owner}/${name}`
}

const createSelectOption = ({ value, label, selected = false, disabled = false }) => {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  option.selected = selected
  option.disabled = disabled
  return option
}

const mergeBranchOptions = ({ preferredBranch, branchNames }) => {
  const dedupe = new Set()
  const result = []

  const pushBranch = branch => {
    const safeBranch = toSafeText(branch)
    if (!safeBranch || dedupe.has(safeBranch)) {
      return
    }

    dedupe.add(safeBranch)
    result.push(safeBranch)
  }

  pushBranch(preferredBranch)

  if (Array.isArray(branchNames)) {
    for (const branchName of branchNames) {
      pushBranch(branchName)
    }
  }

  return result
}

const mergeWhitespaceAroundRemoval = value => value.replace(/\n{3,}/g, '\n\n')

const isSourceRange = value =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isInteger(value[0]) &&
  Number.isInteger(value[1])

const isRemovableAppDeclaration = declaration => {
  if (!declaration || declaration.name !== 'App') {
    return false
  }

  if (!isFunctionLikeDeclaration(declaration)) {
    return false
  }

  if (declaration.kind !== 'variable') {
    return true
  }

  return isFunctionLikeVariableInitializer(declaration)
}

const removeRanges = ({ source, ranges }) => {
  const sortedRanges = ranges.slice().sort((first, second) => second[0] - first[0])
  let output = source

  for (const [start, end] of sortedRanges) {
    if (start < 0 || end < start || end > output.length) {
      continue
    }

    output = `${output.slice(0, start)}${output.slice(end)}`
  }

  return output
}

const stripTopLevelAppWrapper = async ({ source, getTopLevelDeclarations }) => {
  if (typeof source !== 'string' || !source.trim()) {
    return ''
  }

  if (typeof getTopLevelDeclarations !== 'function') {
    return source
  }

  try {
    const declarations = await getTopLevelDeclarations(source)

    if (!Array.isArray(declarations)) {
      return source
    }

    const ranges = declarations
      .filter(isRemovableAppDeclaration)
      .map(declaration => declaration.statementRange)
      .filter(isSourceRange)

    if (ranges.length === 0) {
      return source
    }

    return mergeWhitespaceAroundRemoval(removeRanges({ source, ranges }))
  } catch {
    return source
  }
}

export const createGitHubPrDrawer = ({
  toggleButton,
  drawer,
  closeButton,
  repositorySelect,
  baseBranchInput,
  headBranchInput,
  prTitleInput,
  prBodyInput,
  commitMessageInput,
  includeAppWrapperToggle,
  submitButton,
  titleNode,
  statusNode,
  getToken,
  getSelectedRepository,
  getWritableRepositories,
  setSelectedRepository,
  getFileCommits,
  getEditorSyncTargets,
  getTopLevelDeclarations,
  getRenderMode,
  getStyleMode,
  getDrawerSide,
  confirmBeforeSubmit,
  onPullRequestOpened,
  onPullRequestCommitPushed,
  onActivePrContextChange,
  onSyncActivePrEditorContent,
  onRestoreRenderMode,
  onRestoreStyleMode,
}) => {
  let open = false
  let submitting = false
  let pendingAbortController = null
  let pendingBranchesAbortController = null
  let pendingContextVerifyAbortController = null
  let pendingActiveContentSyncAbortController = null
  let pendingBranchesRequestKey = ''
  let pendingBranchesPromise = null
  let pendingContextVerifyRequestKey = ''
  let pendingContextVerifyPromise = null
  let lastSyncedRepositoryFullName = ''
  let lastActiveContentSyncKey = ''
  const baseBranchesByRepository = new Map()

  const getSelectedRepositoryObject = () => getSelectedRepository?.() ?? null

  const getRepositoryFullName = repository =>
    typeof repository?.fullName === 'string' ? repository.fullName : ''

  const getCurrentActivePrContext = () => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    if (!repositoryFullName) {
      return null
    }

    return getActiveRepositoryPrContext(repositoryFullName)
  }

  const syncModeFields = () => {
    const isPushCommitMode = Boolean(getCurrentActivePrContext())

    if (repositorySelect instanceof HTMLSelectElement) {
      repositorySelect.disabled = submitting || isPushCommitMode
    }

    if (baseBranchInput instanceof HTMLSelectElement) {
      baseBranchInput.disabled = submitting || isPushCommitMode
    }

    if (baseBranchInput instanceof HTMLInputElement) {
      baseBranchInput.readOnly = isPushCommitMode
      baseBranchInput.disabled = submitting
    }

    if (headBranchInput instanceof HTMLInputElement) {
      headBranchInput.readOnly = isPushCommitMode
      headBranchInput.disabled = submitting
    }

    if (prTitleInput instanceof HTMLInputElement) {
      prTitleInput.required = !isPushCommitMode
      prTitleInput.readOnly = isPushCommitMode
      prTitleInput.disabled = submitting
    }

    const prBodyField = prBodyInput?.closest('.github-pr-field')
    if (prBodyField instanceof HTMLElement) {
      prBodyField.hidden = isPushCommitMode
    }

    if (prBodyInput instanceof HTMLTextAreaElement) {
      prBodyInput.required = false
      prBodyInput.disabled = submitting || isPushCommitMode
    }

    if (includeAppWrapperToggle instanceof HTMLInputElement) {
      includeAppWrapperToggle.disabled = submitting
    }

    if (commitMessageInput instanceof HTMLInputElement) {
      commitMessageInput.required = false
      commitMessageInput.readOnly = false
      commitMessageInput.disabled = submitting
    }
  }

  const setSubmitButtonLabel = ({ isPending = false } = {}) => {
    if (!(submitButton instanceof HTMLButtonElement)) {
      return
    }

    const activeContext = getCurrentActivePrContext()
    const isPushCommitMode = Boolean(activeContext)

    if (drawer instanceof HTMLElement) {
      drawer.dataset.mode = isPushCommitMode ? 'push' : 'open'
    }

    if (isPending) {
      submitButton.textContent = isPushCommitMode ? 'Pushing commit...' : 'Opening PR...'
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = isPushCommitMode ? 'Push Commit' : 'Open Pull Request'
      }
      syncModeFields()
      return
    }

    submitButton.textContent = isPushCommitMode ? 'Push commit' : 'Open PR'

    if (titleNode instanceof HTMLElement) {
      titleNode.textContent = isPushCommitMode ? 'Push Commit' : 'Open Pull Request'
    }

    syncModeFields()
  }

  const emitRenderModeRestore = activeContext => {
    if (typeof onRestoreRenderMode !== 'function') {
      return
    }

    if (!activeContext) {
      return
    }

    const mode = normalizeRenderMode(activeContext?.renderMode)
    onRestoreRenderMode(mode)
  }

  const emitStyleModeRestore = activeContext => {
    if (typeof onRestoreStyleMode !== 'function') {
      return
    }

    if (!activeContext) {
      return
    }

    const mode = normalizeStyleMode(activeContext?.styleMode)
    onRestoreStyleMode(mode)
  }

  const emitActivePrContextChange = () => {
    if (typeof onActivePrContextChange !== 'function') {
      return
    }

    const activeContext = getCurrentActivePrContext()
    onActivePrContextChange(activeContext)
    emitRenderModeRestore(activeContext)
    emitStyleModeRestore(activeContext)
  }

  const setStatus = (text, level = 'neutral') => {
    if (!statusNode) {
      return
    }

    statusNode.textContent = text
    statusNode.dataset.level = level
  }

  const setPendingState = isPending => {
    submitting = isPending

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = isPending
      submitButton.setAttribute('aria-busy', isPending ? 'true' : 'false')
      submitButton.classList.toggle('render-button--loading', isPending)
      setSubmitButtonLabel({ isPending })
    }

    for (const input of [
      repositorySelect,
      baseBranchInput,
      headBranchInput,
      prTitleInput,
      prBodyInput,
      commitMessageInput,
      includeAppWrapperToggle,
    ]) {
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement ||
        input instanceof HTMLTextAreaElement
      ) {
        input.disabled = isPending
      }
    }

    syncModeFields()
  }

  const getFormValues = () => {
    return {
      baseBranch: toSafeText(baseBranchInput?.value),
      headBranch: toSafeText(headBranchInput?.value),
      prTitle: toSafeText(prTitleInput?.value),
      prBody: typeof prBodyInput?.value === 'string' ? prBodyInput.value.trim() : '',
      commitMessage: toSafeText(commitMessageInput?.value),
    }
  }

  const abortPendingBranchesRequest = () => {
    pendingBranchesAbortController?.abort()
    pendingBranchesAbortController = null
  }

  const abortPendingContextVerifyRequest = () => {
    pendingContextVerifyAbortController?.abort()
    pendingContextVerifyAbortController = null
    pendingContextVerifyRequestKey = ''
    pendingContextVerifyPromise = null
  }

  const abortPendingActiveContentSyncRequest = () => {
    pendingActiveContentSyncAbortController?.abort()
    pendingActiveContentSyncAbortController = null
  }

  const syncActivePrEditorContent = async () => {
    if (typeof onSyncActivePrEditorContent !== 'function') {
      return
    }

    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    const token = toSafeText(getToken?.())
    const activeContext = getCurrentActivePrContext()

    if (!repositoryFullName || !token || !activeContext) {
      lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      return
    }

    const syncTargets =
      typeof getEditorSyncTargets === 'function' ? getEditorSyncTargets() : null
    const tabSyncTargets = Array.isArray(syncTargets?.tabTargets)
      ? syncTargets.tabTargets
      : []
    const componentSyncPath = toSafeText(
      tabSyncTargets.find(target => toSafeText(target?.kind) === 'component')?.path,
    )
    const stylesSyncPath = toSafeText(
      tabSyncTargets.find(target => toSafeText(target?.kind) === 'styles')?.path,
    )

    if (!componentSyncPath || !stylesSyncPath) {
      lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      return
    }

    const syncKey = [
      repositoryFullName,
      activeContext.headBranch,
      componentSyncPath,
      stylesSyncPath,
      String(activeContext.pullRequestNumber ?? ''),
    ].join('|')

    if (syncKey === lastActiveContentSyncKey) {
      return
    }

    abortPendingActiveContentSyncRequest()
    const abortController = new AbortController()
    pendingActiveContentSyncAbortController = abortController

    try {
      await onSyncActivePrEditorContent({
        token,
        repository,
        activeContext,
        syncTargets: {
          tabTargets: [
            { kind: 'component', path: componentSyncPath },
            { kind: 'styles', path: stylesSyncPath },
          ],
        },
        signal: abortController.signal,
      })

      if (pendingActiveContentSyncAbortController !== abortController) {
        return
      }

      lastActiveContentSyncKey = syncKey
    } catch {
      if (abortController.signal.aborted) {
        return
      }
    } finally {
      if (pendingActiveContentSyncAbortController === abortController) {
        pendingActiveContentSyncAbortController = null
      }
    }
  }

  const verifyActivePullRequestContext = async () => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    const owner = toSafeText(repository?.owner)
    const repo = toSafeText(repository?.name)
    const token = toSafeText(getToken?.())

    if (!repositoryFullName || !owner || !repo || !token) {
      return
    }

    const savedConfig = readRepositoryPrConfig(repositoryFullName)
    if (savedConfig?.isActivePr !== true) {
      return
    }

    const pullRequestNumberFromConfig =
      typeof savedConfig.pullRequestNumber === 'number' &&
      Number.isFinite(savedConfig.pullRequestNumber)
        ? savedConfig.pullRequestNumber
        : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl)
    const headBranch = sanitizeBranchPart(savedConfig.headBranch)

    if (!pullRequestNumberFromConfig && !headBranch) {
      return
    }

    const requestKey = [
      repositoryFullName,
      String(pullRequestNumberFromConfig || ''),
      headBranch,
      toSafeText(savedConfig.baseBranch),
    ].join('|')

    if (pendingContextVerifyPromise && pendingContextVerifyRequestKey === requestKey) {
      await pendingContextVerifyPromise
      return
    }

    abortPendingContextVerifyRequest()
    const abortController = new AbortController()
    pendingContextVerifyAbortController = abortController

    const runVerifyRequest = async () => {
      try {
        let resolvedPullRequest = null
        let pullRequestClosedByNumber = false

        if (pullRequestNumberFromConfig) {
          const pullRequest = await getRepositoryPullRequest({
            token,
            owner,
            repo,
            pullRequestNumber: pullRequestNumberFromConfig,
            signal: abortController.signal,
          })

          if (pullRequest?.isOpen) {
            resolvedPullRequest = pullRequest
          } else if (pullRequest) {
            pullRequestClosedByNumber = true
          }
        }

        if (!resolvedPullRequest && !pullRequestClosedByNumber) {
          resolvedPullRequest = await findOpenRepositoryPullRequestByHead({
            token,
            owner,
            repo,
            headOwner: owner,
            headBranch,
            baseBranch: toSafeText(savedConfig.baseBranch),
            signal: abortController.signal,
          })
        }

        if (pendingContextVerifyAbortController !== abortController) {
          return
        }

        if (resolvedPullRequest?.isOpen) {
          const normalizedSavedConfig = sanitizeRepositoryPrConfig(savedConfig)
          const nextHeadBranch =
            sanitizeBranchPart(resolvedPullRequest.headRef) || headBranch
          const nextBaseBranch =
            toSafeText(resolvedPullRequest.baseRef) || toSafeText(savedConfig.baseBranch)

          saveRepositoryPrConfig({
            repositoryFullName,
            config: {
              ...normalizedSavedConfig,
              isActivePr: true,
              headBranch: nextHeadBranch,
              baseBranch: nextBaseBranch,
              pullRequestNumber: resolvedPullRequest.number,
              pullRequestUrl: resolvedPullRequest.htmlUrl,
              prTitle:
                toSafeText(savedConfig.prTitle) || toSafeText(resolvedPullRequest.title),
            },
          })
          syncFormForRepository({ resetBranch: true })
          setSubmitButtonLabel()
          emitActivePrContextChange()
          void syncActivePrEditorContent()
          return
        }

        saveRepositoryPrConfig({
          repositoryFullName,
          config: {
            ...sanitizeRepositoryPrConfig(savedConfig),
            isActivePr: false,
          },
        })
        setSubmitButtonLabel()
        emitActivePrContextChange()
        lastActiveContentSyncKey = ''
        abortPendingActiveContentSyncRequest()
        setStatus(
          'Saved pull request context is not open on GitHub. Open PR mode restored.',
          'neutral',
        )
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Failed to verify pull request state.'
        setStatus(`Could not verify saved pull request state: ${message}`, 'error')
      } finally {
        if (pendingContextVerifyAbortController === abortController) {
          pendingContextVerifyAbortController = null
        }
      }
    }

    const requestPromise = runVerifyRequest()
    pendingContextVerifyRequestKey = requestKey
    pendingContextVerifyPromise = requestPromise

    try {
      await requestPromise
    } finally {
      if (pendingContextVerifyPromise === requestPromise) {
        pendingContextVerifyPromise = null
        pendingContextVerifyRequestKey = ''
      }
    }
  }

  const renderBaseBranchOptions = ({ preferredBranch, branchNames, loading = false }) => {
    const baseBranch = toSafeText(preferredBranch) || 'main'

    if (baseBranchInput instanceof HTMLInputElement) {
      baseBranchInput.value = baseBranch
      return
    }

    if (!(baseBranchInput instanceof HTMLSelectElement)) {
      return
    }

    if (loading) {
      baseBranchInput.replaceChildren(
        createSelectOption({
          value: baseBranch,
          label: 'Loading branches...',
        }),
      )
      baseBranchInput.value = baseBranch
      baseBranchInput.disabled = true
      return
    }

    const mergedOptions = mergeBranchOptions({ preferredBranch: baseBranch, branchNames })

    const options = mergedOptions.map(branchName =>
      createSelectOption({
        value: branchName,
        label: branchName,
        selected: branchName === baseBranch,
      }),
    )

    const isPushCommitMode = Boolean(getCurrentActivePrContext())

    baseBranchInput.replaceChildren(...options)
    baseBranchInput.disabled = submitting || isPushCommitMode
    baseBranchInput.value = baseBranch
  }

  const getPreferredBaseBranchForRepository = repository => {
    const repositoryFullName = getRepositoryFullName(repository)
    const savedConfig = readRepositoryPrConfig(repositoryFullName)
    return (
      toSafeText(savedConfig.baseBranch) ||
      toSafeText(repository?.defaultBranch) ||
      'main'
    )
  }

  const loadBaseBranchesForSelectedRepository = async ({ preferredBranch }) => {
    const repository = getSelectedRepositoryObject()
    const cacheKey = toBranchCacheKey(repository)
    const nextPreferredBranch =
      toSafeText(preferredBranch) || getPreferredBaseBranchForRepository(repository)
    const requestKey = `${cacheKey}:${nextPreferredBranch}`

    if (!cacheKey) {
      renderBaseBranchOptions({ preferredBranch: nextPreferredBranch, branchNames: [] })
      return
    }

    const token = toSafeText(getToken?.())
    if (!token) {
      renderBaseBranchOptions({ preferredBranch: nextPreferredBranch, branchNames: [] })
      return
    }

    const cachedBranches = baseBranchesByRepository.get(cacheKey)
    if (Array.isArray(cachedBranches) && cachedBranches.length > 0) {
      renderBaseBranchOptions({
        preferredBranch: nextPreferredBranch,
        branchNames: cachedBranches,
      })
      return
    }

    if (pendingBranchesPromise && pendingBranchesRequestKey === requestKey) {
      await pendingBranchesPromise
      return
    }

    abortPendingBranchesRequest()
    renderBaseBranchOptions({ preferredBranch: nextPreferredBranch, loading: true })

    const abortController = new AbortController()
    pendingBranchesAbortController = abortController

    const runBranchRequest = async () => {
      const branches = await listRepositoryBranches({
        token,
        owner: repository.owner,
        repo: repository.name,
        signal: abortController.signal,
      })

      if (pendingBranchesAbortController !== abortController) {
        return
      }

      baseBranchesByRepository.set(cacheKey, branches)
      renderBaseBranchOptions({
        preferredBranch: nextPreferredBranch,
        branchNames: branches,
      })
    }

    const requestPromise = runBranchRequest()

    pendingBranchesRequestKey = requestKey
    pendingBranchesPromise = requestPromise

    try {
      await requestPromise
    } catch {
      if (abortController.signal.aborted) {
        return
      }

      renderBaseBranchOptions({ preferredBranch: nextPreferredBranch, branchNames: [] })
    } finally {
      if (pendingBranchesAbortController === abortController) {
        pendingBranchesAbortController = null
      }

      if (pendingBranchesPromise === requestPromise) {
        pendingBranchesPromise = null
        pendingBranchesRequestKey = ''
      }
    }
  }

  const syncRepositorySelect = ({ repositories, selectedRepository }) => {
    if (!(repositorySelect instanceof HTMLSelectElement)) {
      return
    }

    repositorySelect.replaceChildren()

    if (!Array.isArray(repositories) || repositories.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'Connect a token to load repositories'
      option.selected = true
      repositorySelect.append(option)
      repositorySelect.disabled = true
      return
    }

    const selectedFullName = getRepositoryFullName(selectedRepository)

    const options = repositories.map(repo => {
      const option = document.createElement('option')
      option.value = repo.fullName
      option.textContent = repo.fullName
      option.selected = repo.fullName === selectedFullName
      return option
    })

    repositorySelect.replaceChildren(...options)
    repositorySelect.disabled = false

    if (!selectedFullName && repositories[0]) {
      repositorySelect.value = repositories[0].fullName
      setSelectedRepository?.(repositories[0].fullName)
      return
    }

    repositorySelect.value = selectedFullName
  }

  const syncFormForRepository = ({ resetBranch = false, resetAll = false } = {}) => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    const repositoryChanged =
      Boolean(repositoryFullName) && repositoryFullName !== lastSyncedRepositoryFullName
    const savedConfig = readRepositoryPrConfig(repositoryFullName)
    const savedDraftConfig = resetAll ? {} : savedConfig

    const baseBranch =
      toSafeText(savedConfig.baseBranch) ||
      toSafeText(repository?.defaultBranch) ||
      'main'

    renderBaseBranchOptions({ preferredBranch: baseBranch, branchNames: [] })

    if (headBranchInput instanceof HTMLInputElement) {
      if (
        resetAll ||
        resetBranch ||
        repositoryChanged ||
        !toSafeText(headBranchInput.value)
      ) {
        const savedHeadBranch = sanitizeBranchPart(savedDraftConfig.headBranch)
        headBranchInput.value =
          savedHeadBranch && !isAutoGeneratedHeadBranch(savedHeadBranch)
            ? savedHeadBranch
            : createDefaultBranchName()
      }
    }

    if (prTitleInput instanceof HTMLInputElement) {
      if (resetAll || repositoryChanged || !toSafeText(prTitleInput.value)) {
        prTitleInput.value = toSafeText(savedDraftConfig.prTitle)
      }
    }

    if (prBodyInput instanceof HTMLTextAreaElement) {
      if (resetAll || repositoryChanged || !toSafeText(prBodyInput.value)) {
        prBodyInput.value =
          typeof savedDraftConfig.prBody === 'string' ? savedDraftConfig.prBody : ''
      }
    }

    if (commitMessageInput instanceof HTMLInputElement) {
      if (resetAll || repositoryChanged || !toSafeText(commitMessageInput.value)) {
        commitMessageInput.value = ''
      }
    }

    if (includeAppWrapperToggle instanceof HTMLInputElement) {
      includeAppWrapperToggle.checked = false
    }

    lastSyncedRepositoryFullName = repositoryFullName
  }

  const persistCurrentConfig = () => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    if (!repositoryFullName) {
      return
    }

    const values = getFormValues()
    const currentRenderMode = normalizeRenderMode(getRenderMode?.())
    const currentStyleMode = normalizeStyleMode(getStyleMode?.())
    const existingConfig = readRepositoryPrConfig(repositoryFullName)
    const normalizedExistingConfig = sanitizeRepositoryPrConfig(existingConfig)
    const isActivePr = existingConfig?.isActivePr === true

    if (isActivePr) {
      saveRepositoryPrConfig({
        repositoryFullName,
        config: {
          ...normalizedExistingConfig,
          renderMode: currentRenderMode,
          styleMode: currentStyleMode,
          isActivePr: true,
          pullRequestNumber: existingConfig?.pullRequestNumber,
          pullRequestUrl: existingConfig?.pullRequestUrl,
        },
      })

      setSubmitButtonLabel()
      emitActivePrContextChange()
      return
    }

    saveRepositoryPrConfig({
      repositoryFullName,
      config: {
        baseBranch: values.baseBranch,
        headBranch: isAutoGeneratedHeadBranch(values.headBranch) ? '' : values.headBranch,
        prTitle: values.prTitle,
        prBody: values.prBody,
        renderMode: currentRenderMode,
        styleMode: currentStyleMode,
        isActivePr: false,
        pullRequestNumber: existingConfig?.pullRequestNumber,
        pullRequestUrl: existingConfig?.pullRequestUrl,
      },
    })

    setSubmitButtonLabel()
    emitActivePrContextChange()
  }

  const syncRepositories = () => {
    const repositories = getWritableRepositories?.() ?? []
    const selectedRepository = getSelectedRepositoryObject()
    syncRepositorySelect({ repositories, selectedRepository })
    syncFormForRepository()
    setSubmitButtonLabel()
    emitActivePrContextChange()
    void verifyActivePullRequestContext()
    if (!open) {
      return
    }

    void loadBaseBranchesForSelectedRepository({
      preferredBranch: getFormValues().baseBranch,
    })
  }

  const setOpen = nextOpen => {
    open = nextOpen === true

    if (!(toggleButton instanceof HTMLButtonElement) || !drawer) {
      return
    }

    const preferredSide = getDrawerSide?.() === 'left' ? 'left' : 'right'
    drawer.classList.toggle('github-pr-drawer--left', preferredSide === 'left')
    drawer.classList.toggle('github-pr-drawer--right', preferredSide !== 'left')

    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    drawer.toggleAttribute('hidden', !open)

    if (open) {
      const repositories = getWritableRepositories?.() ?? []
      const selectedRepository = getSelectedRepositoryObject()
      syncRepositorySelect({ repositories, selectedRepository })
      syncFormForRepository()
      setSubmitButtonLabel()
      void loadBaseBranchesForSelectedRepository({
        preferredBranch: getFormValues().baseBranch,
      })
      repositorySelect?.focus()
      return
    }

    abortPendingBranchesRequest()
  }

  const runSubmit = async () => {
    const repository = getSelectedRepositoryObject()
    const repositoryLabel = getRepositoryFullName(repository)
    const token = getToken?.()
    const activeContext = getCurrentActivePrContext()
    const isPushCommitMode = Boolean(activeContext)

    if (!toSafeText(token)) {
      setStatus(
        isPushCommitMode
          ? 'Add a GitHub token before pushing a commit.'
          : 'Add a GitHub token before opening a pull request.',
        'error',
      )
      return
    }

    if (!repositoryLabel) {
      setStatus(
        isPushCommitMode
          ? 'Select a writable repository before pushing a commit.'
          : 'Select a writable repository before opening a pull request.',
        'error',
      )
      return
    }

    const values = getFormValues()
    const targetBaseBranch = isPushCommitMode
      ? toSafeText(activeContext?.baseBranch)
      : values.baseBranch
    const targetHeadBranch = isPushCommitMode
      ? sanitizeBranchPart(activeContext?.headBranch)
      : sanitizeBranchPart(values.headBranch)
    const targetPrTitle = isPushCommitMode
      ? toSafeText(activeContext?.prTitle)
      : values.prTitle
    const targetPrBody = isPushCommitMode
      ? typeof activeContext?.prBody === 'string'
        ? activeContext.prBody
        : ''
      : values.prBody
    const currentRenderMode = normalizeRenderMode(getRenderMode?.())
    const currentStyleMode = normalizeStyleMode(getStyleMode?.())
    const targetCommitMessage = values.commitMessage || defaultCommitMessage

    if (
      !isPushCommitMode &&
      prTitleInput instanceof HTMLInputElement &&
      !prTitleInput.checkValidity()
    ) {
      prTitleInput.reportValidity()
      return
    }

    const includeAppWrapper =
      includeAppWrapperToggle instanceof HTMLInputElement
        ? includeAppWrapperToggle.checked
        : false

    const { fileCommits: normalizedFileCommits, invalidPaths } = normalizeFileCommits(
      typeof getFileCommits === 'function' ? getFileCommits() : [],
    )

    if (invalidPaths.length > 0) {
      const maxInvalidPathsInMessage = 3
      const invalidPathDetails = invalidPaths
        .slice(0, maxInvalidPathsInMessage)
        .map(entry => {
          const sourceLabel = entry.tabLabel ? `${entry.tabLabel}: ` : ''
          return `${sourceLabel}${entry.path} (${entry.reason})`
        })
        .join('; ')
      const remainingCount = invalidPaths.length - maxInvalidPathsInMessage
      const remainingSummary = remainingCount > 0 ? ` (+${remainingCount} more)` : ''

      setStatus(
        `Commit blocked: invalid workspace file path${invalidPaths.length === 1 ? '' : 's'}. ${invalidPathDetails}${remainingSummary}`,
        'error',
      )
      return
    }

    if (normalizedFileCommits.length === 0) {
      setStatus('No workspace files are available to commit.', 'error')
      return
    }

    if (!isPushCommitMode && !targetBaseBranch) {
      setStatus('Base branch is required.', 'error')
      return
    }

    if (!targetHeadBranch) {
      setStatus(
        isPushCommitMode
          ? 'Active pull request context is missing a head branch. Close the context and open a new pull request.'
          : 'Head branch name is required.',
        'error',
      )
      return
    }

    if (!targetPrTitle) {
      setStatus(
        isPushCommitMode
          ? 'Active pull request context is missing a title. Close the context and open a new pull request.'
          : 'Pull request title is required.',
        'error',
      )
      return
    }

    const summary = buildSummary({
      repository,
      baseBranch: targetBaseBranch,
      headBranch: targetHeadBranch,
      fileCommits: normalizedFileCommits,
      prTitle: targetPrTitle,
      commitMessage: targetCommitMessage,
      actionType: isPushCommitMode ? 'push-commit' : 'open-pr',
    })

    const fileUpdates = await Promise.all(
      normalizedFileCommits.map(async fileCommit => {
        const shouldStripEntryWrapper = !includeAppWrapper && fileCommit.isEntry
        const content = shouldStripEntryWrapper
          ? await stripTopLevelAppWrapper({
              source: fileCommit.content,
              getTopLevelDeclarations,
            })
          : fileCommit.content

        return {
          path: fileCommit.path,
          content,
        }
      }),
    )

    const submitRequest = () => {
      pendingAbortController?.abort()
      const abortController = new AbortController()
      pendingAbortController = abortController

      setPendingState(true)
      setStatus(
        isPushCommitMode
          ? 'Committing editor files to active pull request branch...'
          : 'Creating branch, committing editor files, and opening pull request...',
        'pending',
      )

      const runRequest = isPushCommitMode
        ? commitEditorContentToExistingBranch({
            token,
            repository,
            branch: targetHeadBranch,
            fileUpdates,
            commitMessage: targetCommitMessage,
            signal: abortController.signal,
          })
        : createEditorContentPullRequest({
            token,
            repository,
            baseBranch: targetBaseBranch,
            headBranch: targetHeadBranch,
            prTitle: targetPrTitle,
            prBody: targetPrBody,
            fileUpdates,
            commitMessage: targetCommitMessage,
            signal: abortController.signal,
          })

      void Promise.resolve(runRequest)
        .then(result => {
          if (isPushCommitMode) {
            const compactPullRequestReference = formatActivePrReference(activeContext)
            const pullRequestUrl = toSafeText(activeContext?.pullRequestUrl)
            const pullRequestTitle = toSafeText(activeContext?.prTitle)
            const pullRequestReference =
              compactPullRequestReference ||
              pullRequestUrl ||
              (pullRequestTitle ? `PR: ${pullRequestTitle}` : '')

            setStatus(
              pullRequestReference
                ? `Commit pushed to ${targetHeadBranch} (${pullRequestReference}).`
                : `Commit pushed to ${targetHeadBranch}.`,
              'ok',
            )
            onPullRequestCommitPushed?.({
              branch: targetHeadBranch,
              fileUpdates: Array.isArray(result) ? result : [],
            })
            setOpen(false)
            return
          }

          saveRepositoryPrConfig({
            repositoryFullName: repositoryLabel,
            config: {
              renderMode: currentRenderMode,
              styleMode: currentStyleMode,
              baseBranch: targetBaseBranch,
              headBranch: targetHeadBranch,
              prTitle: targetPrTitle,
              prBody: targetPrBody,
              isActivePr: true,
              pullRequestNumber: result.pullRequest.number,
              pullRequestUrl: result.pullRequest.htmlUrl,
            },
          })

          emitActivePrContextChange()
          setSubmitButtonLabel()

          const url = result.pullRequest.htmlUrl
          setStatus(
            url ? `Pull request opened: ${url}` : 'Pull request opened successfully.',
            'ok',
          )
          onPullRequestOpened?.({
            url,
            pullRequestNumber: result.pullRequest.number,
            branch: targetHeadBranch,
            fileUpdates: Array.isArray(result.fileUpdates) ? result.fileUpdates : [],
          })
          setOpen(false)
        })
        .catch(error => {
          if (abortController.signal.aborted) {
            return
          }

          const fallbackMessage = isPushCommitMode
            ? 'Failed to push commit.'
            : 'Failed to open pull request.'
          const message = error instanceof Error ? error.message : fallbackMessage
          setStatus(
            isPushCommitMode
              ? `Push commit failed: ${message}`
              : `Open PR failed: ${message}`,
            'error',
          )
        })
        .finally(() => {
          if (pendingAbortController === abortController) {
            pendingAbortController = null
          }
          setPendingState(false)
        })
    }

    if (typeof confirmBeforeSubmit === 'function') {
      confirmBeforeSubmit({
        title: isPushCommitMode
          ? 'Push commit to active pull request branch?'
          : 'Open pull request with editor content?',
        copy: summary,
        confirmButtonText: isPushCommitMode ? 'Push commit' : 'Open PR',
        onConfirm: submitRequest,
      })
      return
    }

    submitRequest()
  }

  toggleButton?.addEventListener('click', () => {
    setOpen(!open)
  })

  closeButton?.addEventListener('click', () => {
    setOpen(false)
  })

  repositorySelect?.addEventListener('change', () => {
    if (!(repositorySelect instanceof HTMLSelectElement)) {
      return
    }

    const repositoryFullName = toSafeText(repositorySelect.value)
    if (!repositoryFullName) {
      return
    }

    setSelectedRepository?.(repositoryFullName)
    syncFormForRepository({ resetBranch: true })
    setSubmitButtonLabel()
    emitActivePrContextChange()
    void verifyActivePullRequestContext()
    void loadBaseBranchesForSelectedRepository({
      preferredBranch: getFormValues().baseBranch,
    })
  })

  baseBranchInput?.addEventListener('change', persistCurrentConfig)
  baseBranchInput?.addEventListener('blur', persistCurrentConfig)
  headBranchInput?.addEventListener('blur', persistCurrentConfig)
  prTitleInput?.addEventListener('blur', persistCurrentConfig)
  prBodyInput?.addEventListener('blur', persistCurrentConfig)

  submitButton?.addEventListener('click', () => {
    if (submitting) {
      return
    }

    void runSubmit()
  })

  syncRepositories()

  return {
    setOpen,
    isOpen: () => open,
    getActivePrContext: () => getCurrentActivePrContext(),
    disconnectActivePrContext: () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      if (!repositoryFullName) {
        return { reference: '' }
      }

      const savedConfig = readRepositoryPrConfig(repositoryFullName)
      const normalizedSavedConfig = sanitizeRepositoryPrConfig(savedConfig)
      const previousActiveContext =
        savedConfig?.isActivePr === true
          ? {
              repositoryFullName,
              pullRequestNumber:
                typeof savedConfig.pullRequestNumber === 'number' &&
                Number.isFinite(savedConfig.pullRequestNumber)
                  ? savedConfig.pullRequestNumber
                  : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl),
            }
          : null

      if (Object.keys(savedConfig).length > 0) {
        saveRepositoryPrConfig({
          repositoryFullName,
          config: {
            ...normalizedSavedConfig,
            isActivePr: false,
          },
        })
      }

      lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      setSubmitButtonLabel()
      emitActivePrContextChange()

      return {
        reference: formatActivePrReference(previousActiveContext),
      }
    },
    clearActivePrContext: () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      if (!repositoryFullName) {
        return
      }

      removeRepositoryPrConfig(repositoryFullName)
      lastActiveContentSyncKey = ''
      abortPendingActiveContentSyncRequest()
      syncFormForRepository({ resetAll: true, resetBranch: true })
      setSubmitButtonLabel()
      emitActivePrContextChange()
    },
    closeActivePullRequestOnGitHub: async () => {
      const repository = getSelectedRepositoryObject()
      const repositoryFullName = getRepositoryFullName(repository)
      const token = toSafeText(getToken?.())
      const activeContext = getCurrentActivePrContext()
      const pullRequestNumber =
        activeContext?.pullRequestNumber ??
        parsePullRequestNumberFromUrl(activeContext?.pullRequestUrl)

      if (!repositoryFullName || !repository?.owner || !repository?.name) {
        throw new Error('Select a repository before closing pull request context.')
      }

      if (!token) {
        throw new Error('Add a GitHub token before closing a pull request.')
      }

      if (!pullRequestNumber) {
        throw new Error('Active pull request context is missing pull request metadata.')
      }

      setStatus('Closing pull request on GitHub...', 'pending')

      await closeRepositoryPullRequest({
        token,
        owner: repository.owner,
        repo: repository.name,
        pullRequestNumber,
      })

      removeRepositoryPrConfig(repositoryFullName)
      syncFormForRepository({ resetAll: true, resetBranch: true })
      setSubmitButtonLabel()
      emitActivePrContextChange()

      const closedReference = formatActivePrReference({
        repositoryFullName,
        pullRequestNumber,
      })
      setStatus(
        closedReference
          ? `Closed pull request ${closedReference}.`
          : `Closed pull request #${pullRequestNumber}.`,
        'ok',
      )

      return { pullRequestNumber, reference: closedReference }
    },
    setToken: token => {
      const hasToken = typeof token === 'string' && token.trim().length > 0
      if (toggleButton instanceof HTMLButtonElement) {
        toggleButton.disabled = !hasToken
      }

      setSubmitButtonLabel()
      emitActivePrContextChange()
      void verifyActivePullRequestContext()

      if (!hasToken) {
        abortPendingContextVerifyRequest()
        abortPendingActiveContentSyncRequest()
        lastActiveContentSyncKey = ''
        abortPendingBranchesRequest()
        baseBranchesByRepository.clear()
        setOpen(false)
        renderBaseBranchOptions({ preferredBranch: 'main', branchNames: [] })
        return
      }

      if (!open) {
        return
      }

      void loadBaseBranchesForSelectedRepository({
        preferredBranch: getFormValues().baseBranch,
      })
    },
    setSelectedRepository: () => {
      syncRepositories()
    },
    syncRepositories,
    dispose: () => {
      pendingAbortController?.abort()
      pendingAbortController = null
      abortPendingContextVerifyRequest()
      abortPendingActiveContentSyncRequest()
      abortPendingBranchesRequest()
    },
  }
}
