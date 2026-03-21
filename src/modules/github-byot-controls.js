import {
  clearGitHubToken,
  loadGitHubToken,
  maskGitHubToken,
  saveGitHubToken,
} from './github-token-store.js'
import { listWritableRepositories } from './github-api.js'

const selectedRepositoryStorageKey = 'knighted:develop:github-repository'

const loadSelectedRepository = () => {
  try {
    return localStorage.getItem(selectedRepositoryStorageKey)
  } catch {
    return null
  }
}

const saveSelectedRepository = fullName => {
  try {
    localStorage.setItem(selectedRepositoryStorageKey, fullName)
  } catch {
    /* noop */
  }
}

const clearSelectedRepository = () => {
  try {
    localStorage.removeItem(selectedRepositoryStorageKey)
  } catch {
    /* noop */
  }
}

const createDefaultRepoOption = ({
  label,
  disabled = false,
  selected = true,
  value = '',
}) => {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  option.disabled = disabled
  option.selected = selected
  return option
}

export const createGitHubByotControls = ({
  featureEnabled,
  controlsRoot,
  tokenInput,
  tokenInfoButton,
  tokenAddButton,
  tokenDeleteButton,
  repoSelect,
  repoWrap,
  onRepositoryChange,
  onTokenChange,
  setStatus,
}) => {
  if (!featureEnabled) {
    controlsRoot?.setAttribute('hidden', '')
    return {
      getSelectedRepository: () => null,
      getToken: () => null,
    }
  }

  let savedToken = loadGitHubToken()
  let currentRepoRequestAbortController = null
  let displayingMaskedToken = false
  let writableRepos = []
  let addButtonResetTimer = null
  let lastSelectedRepository = loadSelectedRepository()

  const tokenAddPlusIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14"></path>
      <path d="M5 12h14"></path>
    </svg>
  `

  const tokenAddCheckIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 13 4 4L19 7"></path>
    </svg>
  `

  const clearAddButtonResetTimer = () => {
    if (addButtonResetTimer) {
      clearTimeout(addButtonResetTimer)
      addButtonResetTimer = null
    }
  }

  const emitTokenChange = () => {
    if (typeof onTokenChange === 'function') {
      onTokenChange(savedToken)
    }
  }

  const setTokenFieldLockState = isLocked => {
    if (!tokenInput) {
      return
    }

    tokenInput.readOnly = isLocked
    tokenInput.disabled = isLocked
    tokenInput.dataset.tokenState = isLocked ? 'locked' : 'editable'
  }

  const updateTokenActionVisibility = () => {
    const hasProvidedToken =
      typeof savedToken === 'string' && savedToken.trim().length > 0

    if (tokenAddButton instanceof HTMLButtonElement) {
      tokenAddButton.hidden = hasProvidedToken
    }

    if (tokenDeleteButton instanceof HTMLButtonElement) {
      tokenDeleteButton.hidden = !hasProvidedToken
    }
  }

  const setTokenAddButtonState = state => {
    if (!(tokenAddButton instanceof HTMLButtonElement)) {
      return
    }

    tokenAddButton.dataset.state = state

    if (state === 'success') {
      tokenAddButton.innerHTML = tokenAddCheckIcon
      tokenAddButton.setAttribute('aria-label', 'GitHub token added')
      tokenAddButton.setAttribute('title', 'GitHub token added')
      return
    }

    tokenAddButton.innerHTML = tokenAddPlusIcon
    tokenAddButton.setAttribute('aria-label', 'Add GitHub token')
    tokenAddButton.setAttribute('title', 'Add GitHub token')
  }

  const updateTokenAddButtonState = () => {
    if (!(tokenAddButton instanceof HTMLButtonElement) || !tokenInput) {
      return
    }

    if (tokenAddButton.hidden) {
      tokenAddButton.disabled = true
      return
    }

    if (tokenAddButton.dataset.state === 'loading') {
      tokenAddButton.disabled = true
      return
    }

    tokenAddButton.disabled =
      displayingMaskedToken || tokenInput.value.trim().length === 0
  }

  const setTokenFieldToMasked = ({ locked }) => {
    if (!tokenInput || !savedToken) {
      return
    }

    displayingMaskedToken = true
    tokenInput.value = maskGitHubToken(savedToken)
    tokenInput.setAttribute('aria-label', 'GitHub token saved. Delete token to replace')
    setTokenFieldLockState(locked)
    updateTokenAddButtonState()
  }

  const clearRepoOptions = placeholderLabel => {
    if (!(repoSelect instanceof HTMLSelectElement)) {
      return
    }

    repoSelect.replaceChildren(createDefaultRepoOption({ label: placeholderLabel }))
    repoSelect.disabled = true
  }

  const showRepoControl = shouldShow => {
    if (!repoWrap) {
      return
    }

    repoWrap.hidden = !shouldShow
  }

  const renderRepoOptions = repos => {
    if (!(repoSelect instanceof HTMLSelectElement)) {
      return
    }

    if (repos.length === 0) {
      repoSelect.replaceChildren(
        createDefaultRepoOption({
          label: 'No writable repositories available',
          disabled: true,
        }),
      )
      repoSelect.disabled = true
      return
    }

    const hasStoredSelection =
      typeof lastSelectedRepository === 'string' &&
      repos.some(repo => repo.fullName === lastSelectedRepository)

    const selectedRepositoryFullName = hasStoredSelection
      ? lastSelectedRepository
      : repos[0].fullName

    const options = repos.map(repo => {
      const option = document.createElement('option')
      option.value = repo.fullName
      option.textContent = repo.fullName
      option.dataset.owner = repo.owner
      option.dataset.name = repo.name
      option.dataset.defaultBranch = repo.defaultBranch
      option.dataset.htmlUrl = repo.htmlUrl ?? ''
      option.selected = repo.fullName === selectedRepositoryFullName
      return option
    })

    repoSelect.replaceChildren(...options)
    repoSelect.disabled = false
    repoSelect.value = selectedRepositoryFullName
    lastSelectedRepository = selectedRepositoryFullName
    saveSelectedRepository(selectedRepositoryFullName)
  }

  const abortInFlightRepoRequest = () => {
    currentRepoRequestAbortController?.abort()
    currentRepoRequestAbortController = null
  }

  const emitSelectedRepository = () => {
    if (
      typeof onRepositoryChange !== 'function' ||
      !(repoSelect instanceof HTMLSelectElement)
    ) {
      return
    }

    const selectedOption = repoSelect.selectedOptions[0]
    if (!selectedOption || !selectedOption.value) {
      onRepositoryChange(null)
      clearSelectedRepository()
      lastSelectedRepository = null
      return
    }

    saveSelectedRepository(selectedOption.value)
    lastSelectedRepository = selectedOption.value

    onRepositoryChange({
      fullName: selectedOption.value,
      owner: selectedOption.dataset.owner ?? '',
      name: selectedOption.dataset.name ?? '',
      defaultBranch: selectedOption.dataset.defaultBranch ?? 'main',
      htmlUrl: selectedOption.dataset.htmlUrl ?? '',
    })
  }

  const loadWritableRepos = async token => {
    abortInFlightRepoRequest()
    const requestAbortController = new AbortController()
    currentRepoRequestAbortController = requestAbortController
    clearAddButtonResetTimer()
    setTokenAddButtonState('loading')

    clearRepoOptions('Loading writable repositories...')
    showRepoControl(true)
    setStatus('Loading writable repositories from GitHub...', 'pending')

    try {
      const repos = await listWritableRepositories({
        token,
        signal: requestAbortController.signal,
      })

      if (currentRepoRequestAbortController !== requestAbortController) {
        return { ok: false, repos: [] }
      }

      writableRepos = repos
      renderRepoOptions(repos)
      emitSelectedRepository()
      setTokenAddButtonState('success')
      clearAddButtonResetTimer()
      addButtonResetTimer = setTimeout(() => {
        setTokenAddButtonState('idle')
        updateTokenActionVisibility()
        setTokenFieldLockState(true)
        updateTokenAddButtonState()
      }, 1600)

      if (repos.length > 0) {
        setStatus(`Loaded ${repos.length} writable repositories`, 'neutral')
      } else {
        setStatus('Token is valid, but no writable repositories were found', 'error')
      }

      return { ok: true, repos }
    } catch (error) {
      if (requestAbortController.signal.aborted) {
        return { ok: false, repos: [] }
      }

      writableRepos = []
      renderRepoOptions([])
      showRepoControl(false)
      setStatus(
        error instanceof Error
          ? `GitHub token validation failed: ${error.message}`
          : 'GitHub token validation failed',
        'error',
      )
      setTokenAddButtonState('idle')
      updateTokenActionVisibility()
      setTokenFieldLockState(false)
      updateTokenAddButtonState()

      return { ok: false, repos: [] }
    }
  }

  const syncSavedTokenUi = () => {
    if (!tokenInput) {
      return
    }

    if (savedToken) {
      updateTokenActionVisibility()
      setTokenFieldToMasked({ locked: true })
      showRepoControl(false)
      return
    }

    displayingMaskedToken = false
    tokenInput.value = ''
    tokenInput.setAttribute('aria-label', 'GitHub token')
    setTokenFieldLockState(false)
    updateTokenActionVisibility()
    showRepoControl(false)
    clearRepoOptions('Connect a token to load repositories')
    updateTokenAddButtonState()
  }

  const persistAndLoadToken = async token => {
    if (displayingMaskedToken) {
      setStatus('Delete the saved token before adding a new one', 'neutral')
      return
    }

    const trimmedToken = token.trim()

    if (!trimmedToken) {
      setStatus('Enter a GitHub token before adding it', 'error')
      return
    }

    const previousToken = savedToken
    const result = await loadWritableRepos(trimmedToken)

    if (!result.ok) {
      savedToken = previousToken
      displayingMaskedToken = false
      setTokenFieldLockState(false)
      updateTokenAddButtonState()
      return
    }

    const tokenSaved = saveGitHubToken(trimmedToken)
    if (!tokenSaved) {
      setStatus(
        'Token is valid, but could not be saved in this browser context. You can still continue for this session.',
        'error',
      )
      savedToken = previousToken
      displayingMaskedToken = false
      tokenInput.value = trimmedToken
      tokenInput.setAttribute('aria-label', 'GitHub token')
      setTokenFieldLockState(false)
      updateTokenActionVisibility()
      updateTokenAddButtonState()
      return
    }

    savedToken = trimmedToken
    emitTokenChange()
    setTokenFieldToMasked({ locked: true })
  }

  tokenInput?.addEventListener('input', () => {
    updateTokenAddButtonState()
  })

  tokenAddButton?.addEventListener('click', () => {
    void persistAndLoadToken(tokenInput?.value ?? '')
  })

  tokenInput?.addEventListener('keydown', event => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    void persistAndLoadToken(tokenInput.value)
  })

  tokenDeleteButton?.addEventListener('click', () => {
    abortInFlightRepoRequest()
    clearAddButtonResetTimer()
    setTokenAddButtonState('idle')
    savedToken = null
    writableRepos = []
    clearSelectedRepository()
    lastSelectedRepository = null
    clearGitHubToken()
    emitTokenChange()
    onRepositoryChange?.(null)
    syncSavedTokenUi()
    setStatus('GitHub token removed', 'neutral')
  })

  tokenInfoButton?.setAttribute('aria-expanded', 'false')
  updateTokenActionVisibility()
  setTokenAddButtonState('idle')
  setTokenFieldLockState(false)
  updateTokenAddButtonState()

  repoSelect?.addEventListener('change', () => {
    emitSelectedRepository()
  })

  controlsRoot?.removeAttribute('hidden')
  syncSavedTokenUi()
  emitTokenChange()

  if (savedToken) {
    setTokenFieldToMasked({ locked: true })
    void loadWritableRepos(savedToken).then(result => {
      if (!result.ok) {
        savedToken = null
        clearGitHubToken()
        emitTokenChange()
        syncSavedTokenUi()
      }
    })
  }

  return {
    getSelectedRepository: () => {
      const fullName = repoSelect?.value
      if (!fullName) {
        return null
      }
      return writableRepos.find(repo => repo.fullName === fullName) ?? null
    },
    getToken: () => savedToken,
  }
}
