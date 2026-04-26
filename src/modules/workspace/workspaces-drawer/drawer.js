const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const normalizeQuery = value => toSafeText(value).toLowerCase()
const localRepositoryFilterValue = '__local__'
const createRepositoryStarterIdPrefix = '__create_repository_context__:'

const toRepositoryStarterSelectionId = repositoryFullName => {
  const repository = toSafeText(repositoryFullName)
  if (!repository || repository === localRepositoryFilterValue) {
    return ''
  }

  return `${createRepositoryStarterIdPrefix}${repository}`
}

const isRepositoryStarterSelectionId = value =>
  toSafeText(value).startsWith(createRepositoryStarterIdPrefix)

const isLocalWorkspaceEntry = workspace => {
  const repository = toSafeText(workspace?.repo)
  return !repository
}

const isLocalOnlyInactiveWorkspace = workspace => {
  const state = toSafeText(workspace?.prContextState).toLowerCase()
  const hasPrNumber = Number.isFinite(workspace?.prNumber)
  return state === 'inactive' && !hasPrNumber
}

const toWorkspaceLabel = workspace => {
  const isLocalOnlyInactive = isLocalOnlyInactiveWorkspace(workspace)

  const hasTitle = toSafeText(workspace?.prTitle)
  if (hasTitle) {
    return isLocalOnlyInactive ? `local:${hasTitle}` : hasTitle
  }

  const hasHead = toSafeText(workspace?.head)
  if (hasHead) {
    return isLocalOnlyInactive ? `local:${hasHead}` : hasHead
  }

  const fallbackLabel = toSafeText(workspace?.id) || 'workspace'
  return isLocalOnlyInactive ? `local:${fallbackLabel}` : fallbackLabel
}

const matchesQuery = (workspace, query) => {
  if (!query) {
    return true
  }

  const haystack = [
    workspace?.id,
    workspace?.repo,
    workspace?.base,
    workspace?.head,
    workspace?.prTitle,
    toWorkspaceLabel(workspace),
  ]
    .map(toSafeText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

export const createWorkspacesDrawer = ({
  toggleButton,
  drawer,
  closeButton,
  statusNode,
  repositorySelect,
  searchInput,
  selectInput,
  openButton,
  removeButton,
  getDrawerSide,
  getRepositoryFilterOptions,
  getSelectedRepositoryFilter,
  onRepositoryFilterChange,
  onRefreshRequested,
  onOpenSelected,
  onRemoveSelected,
} = {}) => {
  let open = false
  let entries = []
  let query = ''
  let selectedId = ''
  let selectedRepositoryFilter = localRepositoryFilterValue
  let hasUserSelectedRepositoryFilter = false

  const getNormalizedRepositoryFilter = value => {
    const normalized = toSafeText(value)
    return normalized || localRepositoryFilterValue
  }

  const getFilteredEntriesByRepository = () => {
    const normalizedRepositoryFilter = getNormalizedRepositoryFilter(
      selectedRepositoryFilter,
    )
    if (normalizedRepositoryFilter === localRepositoryFilterValue) {
      return entries.filter(
        entry => isLocalWorkspaceEntry(entry) || isLocalOnlyInactiveWorkspace(entry),
      )
    }

    return entries.filter(entry => {
      if (toSafeText(entry?.repo) !== normalizedRepositoryFilter) {
        return false
      }

      if (isLocalWorkspaceEntry(entry)) {
        return false
      }

      return !isLocalOnlyInactiveWorkspace(entry)
    })
  }

  const setStatus = (text, level = 'neutral') => {
    if (!(statusNode instanceof HTMLElement)) {
      return
    }

    statusNode.textContent = text
    statusNode.dataset.level = level
  }

  const updateActions = () => {
    const normalizedSelectedId = toSafeText(selectedId)
    const hasSelection = normalizedSelectedId.length > 0
    const isStarterSelection = isRepositoryStarterSelectionId(normalizedSelectedId)

    if (openButton instanceof HTMLButtonElement) {
      openButton.disabled = !hasSelection
    }

    if (removeButton instanceof HTMLButtonElement) {
      removeButton.disabled = !hasSelection || isStarterSelection
    }
  }

  const renderOptions = () => {
    if (!(selectInput instanceof HTMLSelectElement)) {
      return
    }

    const repositoryFilteredEntries = getFilteredEntriesByRepository()
    const filteredEntries = repositoryFilteredEntries.filter(entry =>
      matchesQuery(entry, normalizeQuery(query)),
    )
    const normalizedRepositoryFilter = getNormalizedRepositoryFilter(
      selectedRepositoryFilter,
    )
    const starterSelectionId =
      filteredEntries.length === 0
        ? toRepositoryStarterSelectionId(normalizedRepositoryFilter)
        : ''
    const hasStarterSelection = Boolean(starterSelectionId)

    selectInput.replaceChildren()

    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent =
      repositoryFilteredEntries.length === 0
        ? hasStarterSelection
          ? 'Select to start a new local context'
          : 'No saved local contexts'
        : filteredEntries.length > 0
          ? 'Select a stored local context'
          : 'No matching local contexts'
    placeholder.disabled = filteredEntries.length > 0 || hasStarterSelection
    placeholder.selected = !filteredEntries.some(entry => entry.id === selectedId)
    selectInput.append(placeholder)

    if (hasStarterSelection) {
      const starterOption = document.createElement('option')
      starterOption.value = starterSelectionId
      starterOption.textContent = `Start new context for ${normalizedRepositoryFilter}`
      starterOption.selected = selectedId === starterSelectionId
      selectInput.append(starterOption)
    }

    for (const entry of filteredEntries) {
      const option = document.createElement('option')
      option.value = toSafeText(entry.id)
      option.textContent = toWorkspaceLabel(entry)
      option.selected = option.value === selectedId
      selectInput.append(option)
    }

    if (searchInput instanceof HTMLInputElement) {
      searchInput.disabled = repositoryFilteredEntries.length === 0
    }

    const hasSelectedFilteredEntry = filteredEntries.some(
      entry => entry.id === selectedId,
    )
    const hasSelectedStarterEntry =
      hasStarterSelection && selectedId === starterSelectionId

    if (!hasSelectedFilteredEntry && !hasSelectedStarterEntry) {
      selectedId = hasStarterSelection ? starterSelectionId : ''
      selectInput.value = selectedId
    }

    updateActions()
  }

  const syncRepositoryFilterOptions = () => {
    if (!(repositorySelect instanceof HTMLSelectElement)) {
      return
    }

    const options =
      typeof getRepositoryFilterOptions === 'function'
        ? getRepositoryFilterOptions()
        : [{ value: localRepositoryFilterValue, label: 'Local' }]

    const normalizedOptions = Array.isArray(options)
      ? options
          .map(option => ({
            value: toSafeText(option?.value),
            label: toSafeText(option?.label),
          }))
          .filter(option => option.value && option.label)
      : []

    const hasLocalOption = normalizedOptions.some(
      option => option.value === localRepositoryFilterValue,
    )

    const repositoryOptions = hasLocalOption
      ? normalizedOptions
      : [{ value: localRepositoryFilterValue, label: 'Local' }, ...normalizedOptions]

    const requestedFilter = hasUserSelectedRepositoryFilter
      ? selectedRepositoryFilter
      : typeof getSelectedRepositoryFilter === 'function'
        ? getSelectedRepositoryFilter()
        : selectedRepositoryFilter

    const nextSelectedFilter = getNormalizedRepositoryFilter(requestedFilter)

    repositorySelect.replaceChildren(
      ...repositoryOptions.map(option => {
        const optionNode = document.createElement('option')
        optionNode.value = option.value
        optionNode.textContent = option.label
        optionNode.selected = option.value === nextSelectedFilter
        return optionNode
      }),
    )

    if (repositoryOptions.some(option => option.value === nextSelectedFilter)) {
      selectedRepositoryFilter = nextSelectedFilter
      repositorySelect.value = nextSelectedFilter
      return
    }

    selectedRepositoryFilter = localRepositoryFilterValue
    repositorySelect.value = localRepositoryFilterValue
  }

  const refresh = async ({ preserveSelection = true } = {}) => {
    if (typeof onRefreshRequested !== 'function') {
      entries = []
      selectedId = ''
      renderOptions()
      return entries
    }

    try {
      const nextEntries = await onRefreshRequested()
      entries = Array.isArray(nextEntries) ? nextEntries : []
    } catch {
      entries = []
      selectedId = ''
      setStatus('Could not refresh stored local contexts.', 'error')
      renderOptions()
      return entries
    }

    syncRepositoryFilterOptions()

    if (!preserveSelection) {
      selectedId = ''
    }

    if (!entries.some(entry => toSafeText(entry?.id) === selectedId)) {
      selectedId = ''
    }

    renderOptions()
    return entries
  }

  const setOpen = async nextOpen => {
    const nextState = nextOpen === true
    open = nextState

    if (
      !(toggleButton instanceof HTMLButtonElement) ||
      !(drawer instanceof HTMLElement)
    ) {
      return
    }

    const preferredSide = getDrawerSide?.() === 'left' ? 'left' : 'right'
    drawer.classList.toggle('workspaces-drawer--left', preferredSide === 'left')
    drawer.classList.toggle('workspaces-drawer--right', preferredSide !== 'left')

    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    drawer.toggleAttribute('hidden', !open)

    if (!open) {
      return
    }

    try {
      await refresh()
    } catch {
      open = false
      toggleButton.setAttribute('aria-expanded', 'false')
      drawer.toggleAttribute('hidden', true)
      setStatus('Could not open local workspaces drawer.', 'error')
      return
    }

    if (searchInput instanceof HTMLInputElement && !searchInput.disabled) {
      searchInput.focus()
      return
    }

    selectInput?.focus()
  }

  toggleButton?.addEventListener('click', () => {
    void setOpen(!open)
  })

  closeButton?.addEventListener('click', () => {
    void setOpen(false)
  })

  searchInput?.addEventListener('input', () => {
    query = searchInput.value
    renderOptions()
  })

  repositorySelect?.addEventListener('change', async () => {
    selectedRepositoryFilter = getNormalizedRepositoryFilter(repositorySelect.value)
    hasUserSelectedRepositoryFilter = true
    query = ''

    if (typeof onRepositoryFilterChange === 'function') {
      await onRepositoryFilterChange(selectedRepositoryFilter)
    }

    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = ''
    }

    await refresh({ preserveSelection: false })
  })

  selectInput?.addEventListener('change', () => {
    selectedId = toSafeText(selectInput.value)
    updateActions()
  })

  openButton?.addEventListener('click', async () => {
    const id = toSafeText(selectedId)
    if (!id || typeof onOpenSelected !== 'function') {
      return
    }

    selectedId = id

    let opened = false
    try {
      opened = await onOpenSelected(id)
    } catch {
      setStatus('Could not load selected local context.', 'error')
      return
    }

    if (!opened) {
      return
    }

    setStatus('Loaded local workspace context.', 'neutral')
    void refresh({ preserveSelection: true })
  })

  removeButton?.addEventListener('click', async () => {
    const id = toSafeText(selectedId)
    if (!id || typeof onRemoveSelected !== 'function') {
      return
    }

    let removed = false
    try {
      removed = await onRemoveSelected(id)
    } catch {
      setStatus('Could not remove selected local context.', 'error')
      return
    }

    if (!removed) {
      return
    }

    selectedId = ''
    setStatus('Removed stored local context.', 'neutral')
    await refresh({ preserveSelection: false })
  })

  return {
    setOpen,
    isOpen: () => open,
    refresh,
    syncRepositoryFilterOptions,
    setStatus,
    setSelectedId: id => {
      selectedId = toSafeText(id)
      renderOptions()
    },
  }
}
