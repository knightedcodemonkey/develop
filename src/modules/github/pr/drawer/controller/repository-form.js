export const createRepositoryFormHandlers = ({
  state,
  toggleButton,
  drawer,
  repositorySelect,
  baseBranchInput,
  headBranchInput,
  prTitleInput,
  prBodyInput,
  commitMessageInput,
  includeAppWrapperToggle,
  getDrawerSide,
  getToken,
  getWritableRepositories,
  setSelectedRepository,
  getSelectedRepositoryObject,
  getRepositoryFullName,
  getCurrentActivePrContext,
  getFormValues,
  setSubmitButtonLabel,
  emitActivePrContextChange,
  verifyActivePullRequestContext,
  toSafeText,
  sanitizeBranchPart,
  createDefaultBranchName,
  createSelectOption,
  mergeBranchOptions,
  toBranchCacheKey,
  listRepositoryBranches,
}) => {
  const emitMetadataInput = element => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      return
    }

    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const setElementValueAndPersist = (element, value) => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      return
    }

    const nextValue = typeof value === 'string' ? value : ''
    if (element.value === nextValue) {
      return
    }

    element.value = nextValue
    emitMetadataInput(element)
  }

  const abortPendingBranchesRequest = () => {
    state.pendingBranchesAbortController?.abort()
    state.pendingBranchesAbortController = null
  }

  const renderBaseBranchOptions = ({ preferredBranch, branchNames, loading = false }) => {
    const baseBranch = toSafeText(preferredBranch) || 'main'

    if (baseBranchInput instanceof HTMLInputElement) {
      setElementValueAndPersist(baseBranchInput, baseBranch)
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
    baseBranchInput.disabled = state.submitting || isPushCommitMode
    setElementValueAndPersist(baseBranchInput, baseBranch)
  }

  const getPreferredBaseBranchForRepository = repository => {
    return toSafeText(repository?.defaultBranch) || 'main'
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

    const cachedBranches = state.baseBranchesByRepository.get(cacheKey)
    if (Array.isArray(cachedBranches) && cachedBranches.length > 0) {
      renderBaseBranchOptions({
        preferredBranch: nextPreferredBranch,
        branchNames: cachedBranches,
      })
      return
    }

    if (state.pendingBranchesPromise && state.pendingBranchesRequestKey === requestKey) {
      await state.pendingBranchesPromise
      return
    }

    abortPendingBranchesRequest()
    renderBaseBranchOptions({ preferredBranch: nextPreferredBranch, loading: true })

    const abortController = new AbortController()
    state.pendingBranchesAbortController = abortController

    const runBranchRequest = async () => {
      const branches = await listRepositoryBranches({
        token,
        owner: repository.owner,
        repo: repository.name,
        signal: abortController.signal,
      })

      if (state.pendingBranchesAbortController !== abortController) {
        return
      }

      state.baseBranchesByRepository.set(cacheKey, branches)
      renderBaseBranchOptions({
        preferredBranch: nextPreferredBranch,
        branchNames: branches,
      })
    }

    const requestPromise = runBranchRequest()

    state.pendingBranchesRequestKey = requestKey
    state.pendingBranchesPromise = requestPromise

    try {
      await requestPromise
    } catch {
      if (abortController.signal.aborted) {
        return
      }

      renderBaseBranchOptions({ preferredBranch: nextPreferredBranch, branchNames: [] })
    } finally {
      if (state.pendingBranchesAbortController === abortController) {
        state.pendingBranchesAbortController = null
      }

      if (state.pendingBranchesPromise === requestPromise) {
        state.pendingBranchesPromise = null
        state.pendingBranchesRequestKey = ''
      }
    }
  }

  const syncRepositorySelect = ({ repositories, selectedRepository }) => {
    if (!(repositorySelect instanceof HTMLSelectElement)) {
      return
    }

    const previousValue = toSafeText(repositorySelect.value)

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
      if (toSafeText(repositorySelect.value) !== previousValue) {
        emitMetadataInput(repositorySelect)
      }
      return
    }

    repositorySelect.value = selectedFullName
    if (toSafeText(repositorySelect.value) !== previousValue) {
      emitMetadataInput(repositorySelect)
    }
  }

  const syncFormForRepository = ({ resetBranch = false, resetAll = false } = {}) => {
    const repository = getSelectedRepositoryObject()
    const repositoryFullName = getRepositoryFullName(repository)
    const repositoryChanged =
      Boolean(repositoryFullName) &&
      repositoryFullName !== state.lastSyncedRepositoryFullName
    const activeContext = getCurrentActivePrContext()

    const baseBranch =
      toSafeText(activeContext?.baseBranch) ||
      toSafeText(repository?.defaultBranch) ||
      'main'

    renderBaseBranchOptions({ preferredBranch: baseBranch, branchNames: [] })

    if (headBranchInput instanceof HTMLInputElement) {
      const activeHeadBranch = sanitizeBranchPart(activeContext?.headBranch)
      const currentHeadBranch = toSafeText(headBranchInput.value)

      if (activeHeadBranch) {
        if (resetAll || resetBranch || repositoryChanged || !currentHeadBranch) {
          setElementValueAndPersist(headBranchInput, activeHeadBranch)
        }
      } else if (!currentHeadBranch) {
        setElementValueAndPersist(headBranchInput, createDefaultBranchName())
      }
    }

    if (prTitleInput instanceof HTMLInputElement) {
      if (resetAll || repositoryChanged || !toSafeText(prTitleInput.value)) {
        setElementValueAndPersist(prTitleInput, toSafeText(activeContext?.prTitle))
      }
    }

    if (prBodyInput instanceof HTMLTextAreaElement) {
      if (resetAll || repositoryChanged || !toSafeText(prBodyInput.value)) {
        prBodyInput.value =
          typeof activeContext?.prBody === 'string' ? activeContext.prBody : ''
      }
    }

    if (commitMessageInput instanceof HTMLInputElement) {
      if (resetAll || repositoryChanged || !toSafeText(commitMessageInput.value)) {
        commitMessageInput.value = ''
      }
    }

    if (includeAppWrapperToggle instanceof HTMLInputElement) {
      includeAppWrapperToggle.checked = true
    }

    state.lastSyncedRepositoryFullName = repositoryFullName
  }

  const refreshContextUi = () => {
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
    if (!state.open) {
      return
    }

    void loadBaseBranchesForSelectedRepository({
      preferredBranch: getFormValues().baseBranch,
    })
  }

  const setOpen = nextOpen => {
    state.open = nextOpen === true

    if (!(toggleButton instanceof HTMLButtonElement) || !drawer) {
      return
    }

    const preferredSide = getDrawerSide?.() === 'left' ? 'left' : 'right'
    drawer.classList.toggle('github-pr-drawer--left', preferredSide === 'left')
    drawer.classList.toggle('github-pr-drawer--right', preferredSide !== 'left')

    toggleButton.setAttribute('aria-expanded', state.open ? 'true' : 'false')
    drawer.toggleAttribute('hidden', !state.open)

    if (state.open) {
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

  return {
    abortPendingBranchesRequest,
    loadBaseBranchesForSelectedRepository,
    refreshContextUi,
    renderBaseBranchOptions,
    setOpen,
    syncFormForRepository,
    syncRepositories,
  }
}
