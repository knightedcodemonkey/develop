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
} from './jsx-top-level-declarations.js'

const prConfigStoragePrefix = 'knighted:develop:github-pr-config:'

const defaultPrConfig = {
  componentFilePath: 'src/components/App.jsx',
  stylesFilePath: 'src/styles/app.css',
}

const supportedRenderModes = new Set(['dom', 'react'])

const normalizeRenderMode = value => {
  const mode = toSafeText(value).toLowerCase()
  return supportedRenderModes.has(mode) ? mode : 'dom'
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
  const componentFilePath = validateFilePath(savedConfig.componentFilePath)
  const stylesFilePath = validateFilePath(savedConfig.stylesFilePath)
  const prTitle = toSafeText(savedConfig.prTitle)
  const baseBranch = toSafeText(savedConfig.baseBranch)

  if (!headBranch || !componentFilePath.ok || !stylesFilePath.ok || !prTitle) {
    return null
  }

  return {
    headBranch,
    componentFilePath: componentFilePath.value,
    stylesFilePath: stylesFilePath.value,
    renderMode: normalizeRenderMode(savedConfig.renderMode),
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

const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

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

const sanitizeAutoBranchPart = value => sanitizeBranchPart(value).toLowerCase()

const toUtcBranchStamp = () => {
  const now = new Date()
  const parts = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ]

  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`
}

const createBranchEntropySuffix = () => Math.random().toString(36).slice(2, 6)

const isAutoGeneratedHeadBranch = value => {
  const branch = sanitizeBranchPart(value)
  if (!branch) {
    return false
  }

  return /^develop\/[^/]+\/editor-sync-\d{8}(?:-\d{6})?(?:-[a-z0-9]{4})?(?:-\d+)?$/.test(
    branch,
  )
}

const createDefaultBranchName = repository => {
  const repoName = sanitizeAutoBranchPart(repository?.name ?? '') || 'repo'
  const stamp = toUtcBranchStamp()
  const entropy = createBranchEntropySuffix()
  return `develop/${repoName}/editor-sync-${stamp}-${entropy}`
}

const toDefaultPrTitle = repository => {
  const label = toSafeText(repository?.fullName) || 'selected repository'
  return `Apply component and styles edits to ${label}`
}

const toDefaultPrBody = ({ componentFilePath, stylesFilePath }) => {
  return [
    'This PR was created from @knighted/develop editor content.',
    '',
    `- Component source -> ${componentFilePath}`,
    `- Styles source -> ${stylesFilePath}`,
  ].join('\n')
}

const buildSummary = ({
  repository,
  baseBranch,
  headBranch,
  componentFilePath,
  stylesFilePath,
  prTitle,
  actionType,
}) => {
  const repositoryLabel = toSafeText(repository?.fullName) || 'No repository selected'
  const isPushCommit = actionType === 'push-commit'

  const lines = [
    `Repository: ${repositoryLabel}`,
    `Head branch: ${headBranch}`,
    `Component file path: ${componentFilePath}`,
    `Styles file path: ${stylesFilePath}`,
    `PR title: ${prTitle}`,
  ]

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
  featureEnabled,
  toggleButton,
  drawer,
  closeButton,
  repositorySelect,
  baseBranchInput,
  headBranchInput,
  componentPathInput,
  stylesPathInput,
  prTitleInput,
  prBodyInput,
  includeAppWrapperToggle,
  submitButton,
  titleNode,
  statusNode,
  getToken,
  getSelectedRepository,
  getWritableRepositories,
  setSelectedRepository,
  getComponentSource,
  getStylesSource,
  getTopLevelDeclarations,
  getRenderMode,
  getDrawerSide,
  confirmBeforeSubmit,
  onPullRequestOpened,
  onPullRequestCommitPushed,
  onActivePrContextChange,
  onSyncActivePrEditorContent,
  onRestoreRenderMode,
}) => {
  if (!featureEnabled) {
    toggleButton?.setAttribute('hidden', '')
    drawer?.setAttribute('hidden', '')

    return {
      setOpen: () => {},
      isOpen: () => false,
      setToken: () => {},
      setSelectedRepository: () => {},
      getActivePrContext: () => null,
      clearActivePrContext: () => {},
      closeActivePullRequestOnGitHub: async () => null,
      syncRepositories: () => {},
      dispose: () => {},
    }
  }

  let open = false
  let submitting = false
  let pendingAbortController = null
  let pendingBranchesAbortController = null
  let pendingContextVerifyAbortController = null
  let pendingActiveContentSyncAbortController = null
  let pendingBranchesRequestKey = ''
  let pendingBranchesPromise = null
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

  const setSubmitButtonLabel = ({ isPending = false } = {}) => {
    if (!(submitButton instanceof HTMLButtonElement)) {
      return
    }

    const activeContext = getCurrentActivePrContext()
    const isPushCommitMode = Boolean(activeContext)

    if (isPending) {
      submitButton.textContent = isPushCommitMode ? 'Pushing commit...' : 'Opening PR...'
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = isPushCommitMode ? 'Push Commit' : 'Open Pull Request'
      }
      return
    }

    submitButton.textContent = isPushCommitMode ? 'Push commit' : 'Open PR'

    if (titleNode instanceof HTMLElement) {
      titleNode.textContent = isPushCommitMode ? 'Push Commit' : 'Open Pull Request'
    }
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

  const emitActivePrContextChange = () => {
    if (typeof onActivePrContextChange !== 'function') {
      return
    }

    const activeContext = getCurrentActivePrContext()
    onActivePrContextChange(activeContext)
    emitRenderModeRestore(activeContext)
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
      componentPathInput,
      stylesPathInput,
      prTitleInput,
      prBodyInput,
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
  }

  const getFormValues = () => {
    return {
      baseBranch: toSafeText(baseBranchInput?.value),
      headBranch: toSafeText(headBranchInput?.value),
      componentFilePath: normalizeFilePath(componentPathInput?.value),
      stylesFilePath: normalizeFilePath(stylesPathInput?.value),
      prTitle: toSafeText(prTitleInput?.value),
      prBody: typeof prBodyInput?.value === 'string' ? prBodyInput.value.trim() : '',
    }
  }

  const abortPendingBranchesRequest = () => {
    pendingBranchesAbortController?.abort()
    pendingBranchesAbortController = null
  }

  const abortPendingContextVerifyRequest = () => {
    pendingContextVerifyAbortController?.abort()
    pendingContextVerifyAbortController = null
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

    const syncKey = [
      repositoryFullName,
      activeContext.headBranch,
      activeContext.componentFilePath,
      activeContext.stylesFilePath,
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

    const headBranch = sanitizeBranchPart(savedConfig.headBranch)
    if (!headBranch) {
      return
    }

    const pullRequestNumberFromConfig =
      typeof savedConfig.pullRequestNumber === 'number' &&
      Number.isFinite(savedConfig.pullRequestNumber)
        ? savedConfig.pullRequestNumber
        : parsePullRequestNumberFromUrl(savedConfig.pullRequestUrl)

    abortPendingContextVerifyRequest()
    const abortController = new AbortController()
    pendingContextVerifyAbortController = abortController

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
        saveRepositoryPrConfig({
          repositoryFullName,
          config: {
            ...savedConfig,
            isActivePr: true,
            renderMode: normalizeRenderMode(savedConfig.renderMode),
            pullRequestNumber: resolvedPullRequest.number,
            pullRequestUrl: resolvedPullRequest.htmlUrl,
            prTitle:
              toSafeText(savedConfig.prTitle) || toSafeText(resolvedPullRequest.title),
          },
        })
        setSubmitButtonLabel()
        emitActivePrContextChange()
        void syncActivePrEditorContent()
        return
      }

      saveRepositoryPrConfig({
        repositoryFullName,
        config: {
          ...savedConfig,
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

    baseBranchInput.replaceChildren(...options)
    baseBranchInput.disabled = submitting
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

    const componentFilePath =
      typeof savedConfig.componentFilePath === 'string' && savedConfig.componentFilePath
        ? savedConfig.componentFilePath
        : defaultPrConfig.componentFilePath
    const stylesFilePath =
      typeof savedConfig.stylesFilePath === 'string' && savedConfig.stylesFilePath
        ? savedConfig.stylesFilePath
        : defaultPrConfig.stylesFilePath

    if (componentPathInput instanceof HTMLInputElement) {
      componentPathInput.value = componentFilePath
    }

    if (stylesPathInput instanceof HTMLInputElement) {
      stylesPathInput.value = stylesFilePath
    }

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
            : createDefaultBranchName(repository)
      }
    }

    if (prTitleInput instanceof HTMLInputElement) {
      if (resetAll || repositoryChanged || !toSafeText(prTitleInput.value)) {
        prTitleInput.value =
          toSafeText(savedDraftConfig.prTitle) || toDefaultPrTitle(repository)
      }
    }

    if (prBodyInput instanceof HTMLTextAreaElement) {
      if (resetAll || repositoryChanged || !toSafeText(prBodyInput.value)) {
        prBodyInput.value =
          typeof savedDraftConfig.prBody === 'string' && savedDraftConfig.prBody
            ? savedDraftConfig.prBody
            : toDefaultPrBody({ componentFilePath, stylesFilePath })
      }
    }

    if (includeAppWrapperToggle instanceof HTMLInputElement) {
      includeAppWrapperToggle.checked = false
    }

    lastSyncedRepositoryFullName = repositoryFullName
  }

  const persistCurrentPaths = () => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    if (!repositoryFullName) {
      return
    }

    const values = getFormValues()
    const currentRenderMode = normalizeRenderMode(getRenderMode?.())
    const existingConfig = readRepositoryPrConfig(repositoryFullName)

    saveRepositoryPrConfig({
      repositoryFullName,
      config: {
        componentFilePath: values.componentFilePath,
        stylesFilePath: values.stylesFilePath,
        baseBranch: values.baseBranch,
        headBranch: isAutoGeneratedHeadBranch(values.headBranch) ? '' : values.headBranch,
        prTitle: values.prTitle,
        prBody: values.prBody,
        renderMode: currentRenderMode,
        isActivePr: existingConfig?.isActivePr === true,
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
    const targetComponentPathValue = isPushCommitMode
      ? activeContext?.componentFilePath
      : values.componentFilePath
    const targetStylesPathValue = isPushCommitMode
      ? activeContext?.stylesFilePath
      : values.stylesFilePath

    const includeAppWrapper =
      includeAppWrapperToggle instanceof HTMLInputElement
        ? includeAppWrapperToggle.checked
        : false
    const componentPathValidation = validateFilePath(targetComponentPathValue)
    if (!componentPathValidation.ok) {
      setStatus(`Component path: ${componentPathValidation.reason}`, 'error')
      return
    }

    const stylesPathValidation = validateFilePath(targetStylesPathValue)
    if (!stylesPathValidation.ok) {
      setStatus(`Styles path: ${stylesPathValidation.reason}`, 'error')
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
      componentFilePath: componentPathValidation.value,
      stylesFilePath: stylesPathValidation.value,
      prTitle: targetPrTitle,
      actionType: isPushCommitMode ? 'push-commit' : 'open-pr',
    })

    const originalComponentSource =
      typeof getComponentSource === 'function' ? getComponentSource() : ''
    const componentSource = includeAppWrapper
      ? originalComponentSource
      : await stripTopLevelAppWrapper({
          source: originalComponentSource,
          getTopLevelDeclarations,
        })

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
            componentFilePath: componentPathValidation.value,
            componentSource,
            stylesFilePath: stylesPathValidation.value,
            stylesSource: typeof getStylesSource === 'function' ? getStylesSource() : '',
            commitMessage: `chore: sync editor component and styles from @knighted/develop`,
            signal: abortController.signal,
          })
        : createEditorContentPullRequest({
            token,
            repository,
            baseBranch: targetBaseBranch,
            headBranch: targetHeadBranch,
            prTitle: targetPrTitle,
            prBody: targetPrBody,
            componentFilePath: componentPathValidation.value,
            componentSource,
            stylesFilePath: stylesPathValidation.value,
            stylesSource: typeof getStylesSource === 'function' ? getStylesSource() : '',
            commitMessage: `chore: sync editor component and styles from @knighted/develop`,
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
              componentFilePath: componentPathValidation.value,
              stylesFilePath: stylesPathValidation.value,
              renderMode: currentRenderMode,
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
        fallbackConfirmText: summary,
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

  componentPathInput?.addEventListener('blur', persistCurrentPaths)
  stylesPathInput?.addEventListener('blur', persistCurrentPaths)
  baseBranchInput?.addEventListener('change', persistCurrentPaths)
  baseBranchInput?.addEventListener('blur', persistCurrentPaths)
  headBranchInput?.addEventListener('blur', persistCurrentPaths)
  prTitleInput?.addEventListener('blur', persistCurrentPaths)
  prBodyInput?.addEventListener('blur', persistCurrentPaths)

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
