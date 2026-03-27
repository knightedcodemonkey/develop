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
  onRepositoryChange,
  onWritableRepositoriesChange,
  onTokenDeleteRequest,
  onTokenChange,
  setStatus,
}) => {
  if (!featureEnabled) {
    controlsRoot?.setAttribute('hidden', '')
    return {
      getSelectedRepository: () => null,
      getWritableRepositories: () => [],
      setSelectedRepository: () => false,
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
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path>
    </svg>
  `

  const tokenAddCheckIcon = `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm1.5 0a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm10.28-1.72-4.5 4.5a.75.75 0 0 1-1.06 0l-2-2a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l1.47 1.47 3.97-3.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path>
    </svg>
  `

  const tokenInfoMissingIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 16.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-2.517-7.665c.112-.223.268-.424.488-.57C11.186 8.12 11.506 8 12 8c.384 0 .766.118 1.034.319a.953.953 0 0 1 .403.806c0 .48-.218.81-.62 1.186a9.293 9.293 0 0 1-.409.354 19.8 19.8 0 0 0-.294.249c-.246.213-.524.474-.738.795l-.126.19V13.5a.75.75 0 0 0 1.5 0v-1.12c.09-.1.203-.208.347-.333.063-.055.14-.119.222-.187.166-.14.358-.3.52-.452.536-.5 1.098-1.2 1.098-2.283a2.45 2.45 0 0 0-1.003-2.006C13.37 6.695 12.658 6.5 12 6.5c-.756 0-1.373.191-1.861.517a2.944 2.944 0 0 0-.997 1.148.75.75 0 0 0 1.341.67Z"></path>
      <path d="M9.864 1.2a3.61 3.61 0 0 1 4.272 0l1.375 1.01c.274.2.593.333.929.384l1.686.259a3.61 3.61 0 0 1 3.021 3.02l.259 1.687c.051.336.183.655.384.929l1.01 1.375a3.61 3.61 0 0 1 0 4.272l-1.01 1.375a2.106 2.106 0 0 0-.384.929l-.259 1.686a3.61 3.61 0 0 1-3.02 3.021l-1.687.259a2.106 2.106 0 0 0-.929.384l-1.375 1.01a3.61 3.61 0 0 1-4.272 0l-1.375-1.01a2.106 2.106 0 0 0-.929-.384l-1.686-.259a3.61 3.61 0 0 1-3.021-3.02l-.259-1.687a2.106 2.106 0 0 0-.384-.929L1.2 14.136a3.61 3.61 0 0 1 0-4.272l1.01-1.375c.201-.274.333-.593.384-.929l.259-1.686a3.61 3.61 0 0 1 3.02-3.021l1.687-.259c.336-.051.655-.183.929-.384Zm3.384 1.209a2.11 2.11 0 0 0-2.496 0l-1.376 1.01a3.61 3.61 0 0 1-1.589.658l-1.686.258a2.111 2.111 0 0 0-1.766 1.766l-.258 1.686a3.614 3.614 0 0 1-.658 1.59l-1.01 1.375a2.11 2.11 0 0 0 0 2.496l1.01 1.376a3.61 3.61 0 0 1 .658 1.589l.258 1.686a2.11 2.11 0 0 0 1.766 1.765l1.686.26a3.613 3.613 0 0 1 1.59.657l1.375 1.01a2.11 2.11 0 0 0 2.496 0l1.376-1.01a3.61 3.61 0 0 1 1.589-.658l1.686-.258a2.11 2.11 0 0 0 1.765-1.766l.26-1.686a3.613 3.613 0 0 1 .657-1.59l1.01-1.375a2.11 2.11 0 0 0 0-2.496l-1.01-1.376a3.61 3.61 0 0 1-.658-1.589l-.258-1.686a2.111 2.111 0 0 0-1.766-1.766l-1.686-.258a3.614 3.614 0 0 1-1.59-.658Z"></path>
    </svg>
  `

  const tokenInfoPresentIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.03 9.78a.75.75 0 0 0-1.06-1.06l-5.47 5.47-2.47-2.47a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l6-6Z"></path>
      <path d="m14.136 1.2 1.375 1.01c.274.201.593.333.929.384l1.687.259a3.61 3.61 0 0 1 3.02 3.021l.259 1.686c.051.336.183.655.384.929l1.01 1.375a3.61 3.61 0 0 1 0 4.272l-1.01 1.375a2.106 2.106 0 0 0-.384.929l-.259 1.687a3.61 3.61 0 0 1-3.021 3.02l-1.686.259a2.106 2.106 0 0 0-.929.384l-1.375 1.01a3.61 3.61 0 0 1-4.272 0l-1.375-1.01a2.106 2.106 0 0 0-.929-.384l-1.687-.259a3.61 3.61 0 0 1-3.02-3.021l-.259-1.686a2.117 2.117 0 0 0-.384-.929L1.2 14.136a3.61 3.61 0 0 1 0-4.272l1.01-1.375c.201-.274.333-.593.384-.929l.259-1.687a3.61 3.61 0 0 1 3.021-3.02l1.686-.259c.336-.051.655-.183.929-.384L9.864 1.2a3.61 3.61 0 0 1 4.272 0Zm-3.384 1.209-1.375 1.01a3.614 3.614 0 0 1-1.59.658l-1.686.258a2.111 2.111 0 0 0-1.766 1.766l-.258 1.686a3.61 3.61 0 0 1-.658 1.589l-1.01 1.376a2.11 2.11 0 0 0 0 2.496l1.01 1.375c.344.469.57 1.015.658 1.59l.258 1.686c.14.911.855 1.626 1.766 1.766l1.686.258a3.61 3.61 0 0 1 1.589.658l1.376 1.01a2.11 2.11 0 0 0 2.496 0l1.375-1.01a3.613 3.613 0 0 1 1.59-.657l1.686-.26a2.11 2.11 0 0 0 1.766-1.765l.258-1.686a3.61 3.61 0 0 1 .658-1.589l1.01-1.376a2.11 2.11 0 0 0 0-2.496l-1.01-1.375a3.613 3.613 0 0 1-.657-1.59l-.26-1.686a2.11 2.11 0 0 0-1.765-1.766l-1.686-.258a3.61 3.61 0 0 1-1.589-.658l-1.376-1.01a2.11 2.11 0 0 0-2.496 0Z"></path>
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

    if (tokenInfoButton instanceof HTMLButtonElement) {
      tokenInfoButton.dataset.tokenState = hasProvidedToken ? 'present' : 'missing'
      tokenInfoButton.innerHTML = hasProvidedToken
        ? tokenInfoPresentIcon
        : tokenInfoMissingIcon
      tokenInfoButton.setAttribute(
        'aria-label',
        hasProvidedToken
          ? 'About GitHub token privacy'
          : 'About GitHub token features and privacy',
      )

      const tokenControlWrap = tokenInfoButton.closest('.github-token-control-wrap')
      if (tokenControlWrap instanceof HTMLElement) {
        tokenControlWrap.dataset.tokenState = hasProvidedToken ? 'present' : 'missing'
      }
    }

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
    if (repoSelect instanceof HTMLSelectElement) {
      repoSelect.replaceChildren(
        createDefaultRepoOption({
          label: placeholderLabel,
          disabled: true,
        }),
      )
      repoSelect.disabled = true
    }

    if (typeof onWritableRepositoriesChange === 'function') {
      onWritableRepositoriesChange({
        repositories: [],
        selectedRepository: null,
        placeholderLabel,
      })
    }
  }

  const getSelectedRepositoryObject = () => {
    if (!lastSelectedRepository) {
      return null
    }

    return writableRepos.find(repo => repo.fullName === lastSelectedRepository) ?? null
  }

  const emitWritableRepositories = ({ placeholderLabel = '' } = {}) => {
    if (typeof onWritableRepositoriesChange !== 'function') {
      return
    }

    onWritableRepositoriesChange({
      repositories: [...writableRepos],
      selectedRepository: getSelectedRepositoryObject(),
      placeholderLabel,
    })
  }

  const selectPreferredRepository = repos => {
    if (!Array.isArray(repos) || repos.length === 0) {
      clearSelectedRepository()
      lastSelectedRepository = null
      return null
    }

    const hasStoredSelection =
      typeof lastSelectedRepository === 'string' &&
      repos.some(repo => repo.fullName === lastSelectedRepository)

    const selectedRepositoryFullName = hasStoredSelection
      ? lastSelectedRepository
      : repos[0].fullName

    saveSelectedRepository(selectedRepositoryFullName)
    lastSelectedRepository = selectedRepositoryFullName
    return selectedRepositoryFullName
  }

  const renderRepoOptions = repos => {
    const selectedRepositoryFullName = selectPreferredRepository(repos)

    if (!(repoSelect instanceof HTMLSelectElement)) {
      emitWritableRepositories({
        placeholderLabel: repos.length === 0 ? 'No writable repositories available' : '',
      })
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
      emitWritableRepositories({ placeholderLabel: 'No writable repositories available' })
      return
    }

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
    emitWritableRepositories()
  }

  const abortInFlightRepoRequest = () => {
    currentRepoRequestAbortController?.abort()
    currentRepoRequestAbortController = null
  }

  const emitSelectedRepository = () => {
    if (typeof onRepositoryChange !== 'function') {
      return
    }

    if (!(repoSelect instanceof HTMLSelectElement)) {
      const selectedRepository = getSelectedRepositoryObject()
      onRepositoryChange(selectedRepository)
      emitWritableRepositories()
      return
    }

    const selectedOption = repoSelect.selectedOptions[0]
    if (!selectedOption || !selectedOption.value) {
      onRepositoryChange(null)
      clearSelectedRepository()
      lastSelectedRepository = null
      emitWritableRepositories()
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
    emitWritableRepositories()
  }

  const loadWritableRepos = async token => {
    abortInFlightRepoRequest()
    const requestAbortController = new AbortController()
    currentRepoRequestAbortController = requestAbortController
    clearAddButtonResetTimer()
    setTokenAddButtonState('loading')

    clearRepoOptions('Loading writable repositories...')
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
      emitWritableRepositories({ placeholderLabel: 'Loading writable repositories...' })
      return
    }

    displayingMaskedToken = false
    tokenInput.value = ''
    tokenInput.setAttribute('aria-label', 'GitHub token')
    setTokenFieldLockState(false)
    updateTokenActionVisibility()
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

  const removeSavedToken = () => {
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
  }

  tokenDeleteButton?.addEventListener('click', () => {
    if (typeof onTokenDeleteRequest === 'function') {
      onTokenDeleteRequest(removeSavedToken)
      return
    }

    removeSavedToken()
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
      return getSelectedRepositoryObject()
    },
    getWritableRepositories: () => [...writableRepos],
    setSelectedRepository: fullName => {
      if (typeof fullName !== 'string' || !fullName.trim()) {
        return false
      }

      const normalizedFullName = fullName.trim()
      const repository = writableRepos.find(repo => repo.fullName === normalizedFullName)
      if (!repository) {
        return false
      }

      lastSelectedRepository = repository.fullName
      saveSelectedRepository(repository.fullName)

      if (repoSelect instanceof HTMLSelectElement) {
        repoSelect.value = repository.fullName
      }

      emitSelectedRepository()
      return true
    },
    getToken: () => savedToken,
  }
}
