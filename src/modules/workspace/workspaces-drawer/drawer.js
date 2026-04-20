const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const normalizeQuery = value => toSafeText(value).toLowerCase()

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
  searchInput,
  selectInput,
  openButton,
  removeButton,
  getDrawerSide,
  onRefreshRequested,
  onOpenSelected,
  onRemoveSelected,
} = {}) => {
  let open = false
  let entries = []
  let query = ''
  let selectedId = ''

  const setStatus = (text, level = 'neutral') => {
    if (!(statusNode instanceof HTMLElement)) {
      return
    }

    statusNode.textContent = text
    statusNode.dataset.level = level
  }

  const updateActions = () => {
    const hasSelection = toSafeText(selectedId).length > 0

    if (openButton instanceof HTMLButtonElement) {
      openButton.disabled = !hasSelection
    }

    if (removeButton instanceof HTMLButtonElement) {
      removeButton.disabled = !hasSelection
    }
  }

  const renderOptions = () => {
    if (!(selectInput instanceof HTMLSelectElement)) {
      return
    }

    const filteredEntries = entries.filter(entry =>
      matchesQuery(entry, normalizeQuery(query)),
    )

    selectInput.replaceChildren()

    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent =
      entries.length === 0
        ? 'No saved local contexts'
        : filteredEntries.length > 0
          ? 'Select a stored local context'
          : 'No matching local contexts'
    placeholder.disabled = filteredEntries.length > 0
    placeholder.selected = !filteredEntries.some(entry => entry.id === selectedId)
    selectInput.append(placeholder)

    for (const entry of filteredEntries) {
      const option = document.createElement('option')
      option.value = toSafeText(entry.id)
      option.textContent = toWorkspaceLabel(entry)
      option.selected = option.value === selectedId
      selectInput.append(option)
    }

    if (searchInput instanceof HTMLInputElement) {
      searchInput.disabled = entries.length === 0
    }

    if (!filteredEntries.some(entry => entry.id === selectedId)) {
      selectedId = ''
      selectInput.value = ''
    }

    updateActions()
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

  selectInput?.addEventListener('change', () => {
    selectedId = toSafeText(selectInput.value)
    updateActions()
  })

  openButton?.addEventListener('click', async () => {
    const id = toSafeText(selectedId)
    if (!id || typeof onOpenSelected !== 'function') {
      return
    }

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
    setStatus,
    setSelectedId: id => {
      selectedId = toSafeText(id)
      renderOptions()
    },
  }
}
