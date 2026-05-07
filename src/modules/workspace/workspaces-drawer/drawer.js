const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const localRepositoryFilterValue = '__local__'
const localWorkspaceScopeValue = 'local'
const repositoryWorkspaceScopeValue = 'repository'

const drawerUiState = {
  localEmpty: 'local-empty',
  localWithWorkspaces: 'local-with-workspaces',
  repositoryEmpty: 'repository-empty',
  repositoryWithWorkspaces: 'repository-with-workspaces',
}

const toSafeWorkspaceScope = workspace => {
  const scope = toSafeText(workspace?.workspaceScope).toLowerCase()
  if (scope === repositoryWorkspaceScopeValue) {
    return repositoryWorkspaceScopeValue
  }

  if (scope === localWorkspaceScopeValue) {
    return localWorkspaceScopeValue
  }

  return toSafeText(workspace?.repo)
    ? repositoryWorkspaceScopeValue
    : localWorkspaceScopeValue
}

const toWorkspaceLabel = workspace => {
  const hasTitle = toSafeText(workspace?.prTitle)
  if (hasTitle) {
    return hasTitle
  }

  const hasHead = toSafeText(workspace?.head)
  if (hasHead) {
    return hasHead
  }

  return toSafeText(workspace?.id) || 'workspace'
}

export const createWorkspacesDrawer = ({
  toggleButton,
  drawer,
  closeButton,
  statusNode,
  repositorySelect,
  getActiveWorkspaceId,
  initializeButton,
  shareButton,
  newButton,
  selectInput,
  openButton,
  renameButton,
  removeButton,
  getDrawerSide,
  getActiveWorkspaceDisplayLabel,
  getRepositoryFilterOptions,
  getSelectedRepositoryFilter,
  onRepositoryFilterChange,
  onRefreshRequested,
  onShareCurrentWorkspace,
  onInitializeWorkspace,
  onCreateWorkspace,
  onOpenSelected,
  onRenameSelected,
  onRemoveSelected,
} = {}) => {
  let open = false
  let entries = []
  let selectedId = ''
  let selectedRepositoryFilter = localRepositoryFilterValue
  let hasUserSelectedRepositoryFilter = false
  let currentUiState = drawerUiState.localEmpty

  const getNormalizedRepositoryFilter = value => {
    const normalized = toSafeText(value)
    return normalized || localRepositoryFilterValue
  }

  const isInactiveWithoutPrNumber = workspace => {
    const state = toSafeText(workspace?.prContextState).toLowerCase() || 'inactive'
    const hasPrNumber =
      typeof workspace?.prNumber === 'number' && Number.isFinite(workspace.prNumber)
    return state === 'inactive' && !hasPrNumber
  }

  const shouldRenderAsLocalEntry = workspace => {
    if (toSafeWorkspaceScope(workspace) === localWorkspaceScopeValue) {
      return true
    }

    const activeWorkspaceId =
      typeof getActiveWorkspaceId === 'function'
        ? toSafeText(getActiveWorkspaceId())
        : toSafeText(selectedId)

    return (
      toSafeText(workspace?.id) === activeWorkspaceId &&
      isInactiveWithoutPrNumber(workspace)
    )
  }

  const getFilteredEntriesByRepository = () => {
    const normalizedRepositoryFilter = getNormalizedRepositoryFilter(
      selectedRepositoryFilter,
    )
    if (normalizedRepositoryFilter === localRepositoryFilterValue) {
      return entries.filter(entry => shouldRenderAsLocalEntry(entry))
    }

    return entries.filter(entry => {
      if (toSafeText(entry?.repo) !== normalizedRepositoryFilter) {
        return false
      }

      if (toSafeWorkspaceScope(entry) !== repositoryWorkspaceScopeValue) {
        return false
      }

      return true
    })
  }

  const getUiState = ({ repositoryFilter, hasStoredWorkspaces }) => {
    const isLocalScope = repositoryFilter === localRepositoryFilterValue
    if (isLocalScope) {
      return hasStoredWorkspaces
        ? drawerUiState.localWithWorkspaces
        : drawerUiState.localEmpty
    }

    return hasStoredWorkspaces
      ? drawerUiState.repositoryWithWorkspaces
      : drawerUiState.repositoryEmpty
  }

  const setStatus = (text, level = 'neutral') => {
    if (!(statusNode instanceof HTMLElement)) {
      return
    }

    statusNode.textContent = text
    statusNode.dataset.level = level
  }

  const updateActions = () => {
    const normalizedRepositoryFilter = getNormalizedRepositoryFilter(
      selectedRepositoryFilter,
    )
    const selectedRepositoryContextValue =
      repositorySelect instanceof HTMLSelectElement
        ? getNormalizedRepositoryFilter(repositorySelect.value)
        : normalizedRepositoryFilter
    const isLocalRepositoryContext =
      selectedRepositoryContextValue === localRepositoryFilterValue
    const normalizedSelectedId =
      selectInput instanceof HTMLSelectElement
        ? toSafeText(selectInput.value)
        : toSafeText(selectedId)
    const activeWorkspaceId =
      typeof getActiveWorkspaceId === 'function' ? toSafeText(getActiveWorkspaceId()) : ''
    const hasSelection = normalizedSelectedId.length > 0
    const selectedEntry = entries.find(
      entry => toSafeText(entry?.id) === normalizedSelectedId,
    )
    const selectedWorkspaceScope = toSafeWorkspaceScope(selectedEntry)
    const isSelectedLocalWorkspace =
      hasSelection && selectedWorkspaceScope === localWorkspaceScopeValue
    const isSelectedWorkspaceNonPr =
      hasSelection && isInactiveWithoutPrNumber(selectedEntry)
    const isSelectedWorkspaceActive =
      hasSelection &&
      Boolean(activeWorkspaceId) &&
      normalizedSelectedId === activeWorkspaceId
    const canRenameWorkspace =
      typeof onRenameSelected === 'function' &&
      isSelectedLocalWorkspace &&
      isSelectedWorkspaceNonPr
    const canCreateWorkspace = typeof onCreateWorkspace === 'function'
    const canShareWorkspace = typeof onShareCurrentWorkspace === 'function'
    const canInitializeWorkspace = typeof onInitializeWorkspace === 'function'
    const hasStoredWorkspaces =
      currentUiState === drawerUiState.localWithWorkspaces ||
      currentUiState === drawerUiState.repositoryWithWorkspaces
    const isLocalUiState =
      currentUiState === drawerUiState.localWithWorkspaces ||
      currentUiState === drawerUiState.localEmpty
    const showInitialize = currentUiState === drawerUiState.repositoryEmpty
    const showNewWorkspace = !showInitialize

    const workspaceField = selectInput?.closest('label')
    if (workspaceField instanceof HTMLElement) {
      workspaceField.toggleAttribute('hidden', !hasStoredWorkspaces)
    }

    const actionsRow =
      openButton?.closest('.workspaces-drawer__actions') ??
      removeButton?.closest('.workspaces-drawer__actions')
    if (actionsRow instanceof HTMLElement) {
      actionsRow.toggleAttribute('hidden', !hasStoredWorkspaces)
    }

    if (initializeButton instanceof HTMLButtonElement) {
      initializeButton.toggleAttribute('hidden', !showInitialize)
      initializeButton.disabled = !canInitializeWorkspace
    }

    if (newButton instanceof HTMLButtonElement) {
      newButton.toggleAttribute('hidden', !showNewWorkspace)
      newButton.disabled = !canCreateWorkspace
    }

    if (shareButton instanceof HTMLButtonElement) {
      const showShare = isLocalRepositoryContext
      shareButton.toggleAttribute('hidden', !showShare)
      shareButton.disabled = !showShare || !canShareWorkspace
    }

    if (openButton instanceof HTMLButtonElement) {
      openButton.disabled = !hasSelection
    }

    if (renameButton instanceof HTMLButtonElement) {
      renameButton.toggleAttribute('hidden', !isLocalUiState)
      renameButton.disabled = !canRenameWorkspace
    }

    if (removeButton instanceof HTMLButtonElement) {
      removeButton.disabled = !hasSelection || isSelectedWorkspaceActive
    }
  }

  const renderOptions = () => {
    if (!(selectInput instanceof HTMLSelectElement)) {
      return
    }

    const repositoryFilteredEntries = getFilteredEntriesByRepository()
    const filteredEntries = repositoryFilteredEntries
    const hasStoredWorkspaces = filteredEntries.length > 0
    const normalizedRepositoryFilter = getNormalizedRepositoryFilter(
      selectedRepositoryFilter,
    )

    currentUiState = getUiState({
      repositoryFilter: normalizedRepositoryFilter,
      hasStoredWorkspaces,
    })

    if (!hasStoredWorkspaces) {
      updateActions()
      return
    }

    selectInput.replaceChildren()

    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = 'Select a stored workspace'
    placeholder.disabled = true
    placeholder.selected = !filteredEntries.some(entry => entry.id === selectedId)
    selectInput.append(placeholder)

    const activeWorkspaceId =
      typeof getActiveWorkspaceId === 'function' ? toSafeText(getActiveWorkspaceId()) : ''

    for (const entry of filteredEntries) {
      const option = document.createElement('option')
      option.value = toSafeText(entry.id)
      const activeWorkspaceDisplayLabel =
        option.value &&
        option.value === activeWorkspaceId &&
        typeof getActiveWorkspaceDisplayLabel === 'function'
          ? toSafeText(getActiveWorkspaceDisplayLabel(entry))
          : ''
      option.textContent = activeWorkspaceDisplayLabel || toWorkspaceLabel(entry)
      option.selected = option.value === selectedId
      selectInput.append(option)
    }

    const hasSelectedFilteredEntry = filteredEntries.some(
      entry => entry.id === selectedId,
    )

    if (!hasSelectedFilteredEntry) {
      selectInput.value = ''
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
    const hasWritableRepositoryOptions = normalizedOptions.some(
      option => option.value !== localRepositoryFilterValue,
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

    if (!hasWritableRepositoryOptions) {
      hasUserSelectedRepositoryFilter = false
    }

    repositorySelect.replaceChildren(
      ...repositoryOptions.map(option => {
        const optionNode = document.createElement('option')
        optionNode.value = option.value
        optionNode.textContent = option.label
        optionNode.selected = option.value === nextSelectedFilter
        return optionNode
      }),
    )

    repositorySelect.disabled = !hasWritableRepositoryOptions

    if (!hasWritableRepositoryOptions) {
      selectedRepositoryFilter = localRepositoryFilterValue
      repositorySelect.value = localRepositoryFilterValue
      return
    }

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
      setStatus('Could not refresh stored workspaces.', 'error')
      renderOptions()
      return entries
    }

    syncRepositoryFilterOptions()

    if (!preserveSelection) {
      selectedId = ''
    }

    if (!entries.some(entry => toSafeText(entry?.id) === selectedId)) {
      const activeWorkspaceId =
        typeof getActiveWorkspaceId === 'function'
          ? toSafeText(getActiveWorkspaceId())
          : ''
      const hasActiveWorkspaceEntry = entries.some(
        entry => toSafeText(entry?.id) === activeWorkspaceId,
      )
      selectedId = hasActiveWorkspaceEntry ? activeWorkspaceId : ''
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
      setStatus('Could not open workspaces drawer.', 'error')
      return
    }

    updateActions()

    const workspaceField = selectInput?.closest('label')
    if (workspaceField instanceof HTMLElement && !workspaceField.hasAttribute('hidden')) {
      selectInput?.focus()
      return
    }

    if (
      initializeButton instanceof HTMLButtonElement &&
      !initializeButton.hasAttribute('hidden')
    ) {
      initializeButton.focus()
      return
    }

    newButton?.focus()
  }

  const closeDrawer = () => {
    open = false

    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.setAttribute('aria-expanded', 'false')
    }

    if (drawer instanceof HTMLElement) {
      drawer.toggleAttribute('hidden', true)
    }
  }

  toggleButton?.addEventListener('click', () => {
    void setOpen(!open)
  })

  closeButton?.addEventListener('click', () => {
    void setOpen(false)
  })

  repositorySelect?.addEventListener('change', async () => {
    selectedRepositoryFilter = getNormalizedRepositoryFilter(repositorySelect.value)
    hasUserSelectedRepositoryFilter = true

    if (typeof onRepositoryFilterChange === 'function') {
      await onRepositoryFilterChange(selectedRepositoryFilter)
    }

    await refresh({ preserveSelection: false })
  })

  selectInput?.addEventListener('change', () => {
    selectedId = toSafeText(selectInput.value)
    updateActions()
  })

  initializeButton?.addEventListener('click', async () => {
    if (typeof onInitializeWorkspace !== 'function') {
      return
    }

    let initialized = false
    try {
      initialized = await onInitializeWorkspace(
        getNormalizedRepositoryFilter(selectedRepositoryFilter),
      )
    } catch {
      setStatus('Could not initialize workspace.', 'error')
      return
    }

    if (!initialized) {
      return
    }

    closeDrawer()
    selectedId = ''
    setStatus('Initialized workspace.', 'neutral')
  })

  newButton?.addEventListener('click', async () => {
    if (typeof onCreateWorkspace !== 'function') {
      return
    }

    let created = false
    try {
      created = await onCreateWorkspace(
        getNormalizedRepositoryFilter(selectedRepositoryFilter),
      )
    } catch {
      setStatus('Could not create workspace.', 'error')
      return
    }

    if (!created) {
      return
    }

    selectedId =
      typeof getActiveWorkspaceId === 'function' ? toSafeText(getActiveWorkspaceId()) : ''
    setStatus('Created workspace.', 'neutral')
    await refresh({ preserveSelection: Boolean(selectedId) })
    closeDrawer()
  })

  shareButton?.addEventListener('click', async () => {
    if (typeof onShareCurrentWorkspace !== 'function') {
      return
    }

    const normalizedRepositoryFilter = getNormalizedRepositoryFilter(
      selectedRepositoryFilter,
    )

    try {
      await onShareCurrentWorkspace(normalizedRepositoryFilter)
    } catch {
      setStatus('Could not share workspace.', 'error')
    }
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
      setStatus('Could not load selected workspace.', 'error')
      return
    }

    if (!opened) {
      return
    }

    closeDrawer()
    setStatus('Loaded workspace.', 'neutral')
  })

  renameButton?.addEventListener('click', async () => {
    const id = toSafeText(selectedId)
    if (!id || typeof onRenameSelected !== 'function') {
      return
    }

    selectedId = id

    let renamed = false
    try {
      renamed = await onRenameSelected(id)
    } catch {
      setStatus('Could not rename stored workspace.', 'error')
      return
    }

    if (!renamed) {
      return
    }

    await refresh({ preserveSelection: true })
    setStatus('Renamed workspace.', 'neutral')
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
      setStatus('Could not remove selected workspace.', 'error')
      return
    }

    if (!removed) {
      return
    }

    selectedId = ''
    setStatus('Removed stored workspace.', 'neutral')
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
