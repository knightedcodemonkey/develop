const createWorkspaceTabMutationsController = ({
  toNonEmptyWorkspaceText,
  workspaceTabsState,
  setWorkspaceTabRenameState,
  renderWorkspaceTabs,
  setStatus,
  allowedEntryTabFileNames,
  getPathFileName,
  normalizeEntryTabPath,
  normalizeModuleTabPathForRename,
  defaultComponentTabName,
  getDirtyStateForTabChange,
  syncHeaderLabels,
  queueWorkspaceSave,
  flushWorkspaceSave,
  maybeRender,
  setWorkspaceTabAddMenuOpen,
  confirmAction,
  getTabKind,
  persistActiveTabEditorContent,
  getLoadedComponentTabId,
  setLoadedComponentTabId,
  getLoadedStylesTabId,
  setLoadedStylesTabId,
  getActiveWorkspaceTab,
  loadWorkspaceTabIntoEditor,
  getWorkspaceTabByKind,
  setActiveWorkspaceTab,
  makeUniqueTabPath,
  createWorkspaceTabId,
  getShouldShowEditedDesign,
}) => {
  const beginWorkspaceTabRename = tabId => {
    setWorkspaceTabAddMenuOpen(false)
    setWorkspaceTabRenameState({
      tabId: toNonEmptyWorkspaceText(tabId),
    })
    renderWorkspaceTabs()
  }

  const finishWorkspaceTabRename = ({ tabId, nextName, cancelled = false }) => {
    const normalizedTabId = toNonEmptyWorkspaceText(tabId)
    const tab = workspaceTabsState.getTab(normalizedTabId)

    setWorkspaceTabRenameState({ tabId: '' })

    if (!tab || cancelled) {
      renderWorkspaceTabs()
      return
    }

    const normalizedNameInput = toNonEmptyWorkspaceText(nextName)
    const normalizedName = getPathFileName(normalizedNameInput) || normalizedNameInput
    if (!normalizedName) {
      setStatus('Tab name cannot be empty.', 'error')
      renderWorkspaceTabs()
      return
    }

    if (
      tab.role === 'entry' &&
      !allowedEntryTabFileNames.has(normalizedName.toLowerCase())
    ) {
      setStatus('Entry tab name must be App.tsx or App.js.', 'error')
      renderWorkspaceTabs()
      return
    }

    const normalizedEntryPath =
      tab.role === 'entry'
        ? normalizeEntryTabPath(tab.path, { preferredFileName: normalizedName })
        : normalizeModuleTabPathForRename(tab.path, normalizedName)
    const normalizedTabName =
      tab.role === 'entry'
        ? getPathFileName(normalizedEntryPath) || defaultComponentTabName
        : getPathFileName(normalizedEntryPath) || normalizedName

    workspaceTabsState.upsertTab({
      ...tab,
      name: normalizedTabName,
      path: normalizedEntryPath,
      isDirty: getDirtyStateForTabChange(
        tab,
        typeof tab?.content === 'string' ? tab.content : '',
      ),
      lastModified: Date.now(),
    })

    syncHeaderLabels()
    renderWorkspaceTabs()
    queueWorkspaceSave()
    maybeRender()
  }

  const removeWorkspaceTab = tabId => {
    setWorkspaceTabAddMenuOpen(false)
    const tab = workspaceTabsState.getTab(tabId)
    if (!tab) {
      return
    }

    if (tab.role === 'entry') {
      setStatus('The entry tab cannot be removed.', 'neutral')
      return
    }

    confirmAction({
      title: `Remove tab ${tab.name}?`,
      copy: 'This removes the tab and its local source content from this workspace context.',
      confirmButtonText: 'Remove tab',
      onConfirm: () => {
        const removedKind = getTabKind(tab)
        persistActiveTabEditorContent()
        const removed = workspaceTabsState.removeTab(tab.id)
        if (!removed) {
          return
        }

        if (getLoadedComponentTabId() === tab.id) {
          setLoadedComponentTabId(
            workspaceTabsState.getTabs().find(entry => getTabKind(entry) === 'component')
              ?.id || 'component',
          )
        }

        if (getLoadedStylesTabId() === tab.id) {
          setLoadedStylesTabId(
            workspaceTabsState.getTabs().find(entry => getTabKind(entry) === 'styles')
              ?.id || 'styles',
          )
        }

        const activeTab = getActiveWorkspaceTab()
        if (activeTab) {
          loadWorkspaceTabIntoEditor(activeTab)
        } else {
          const fallbackTab =
            getWorkspaceTabByKind(removedKind === 'styles' ? 'component' : 'styles') ||
            workspaceTabsState.getTabs()[0] ||
            null
          if (fallbackTab) {
            setActiveWorkspaceTab(fallbackTab.id)
          }
        }

        renderWorkspaceTabs()
        if (typeof flushWorkspaceSave === 'function') {
          void flushWorkspaceSave().catch(() => {
            /* Save failures are surfaced through workspace saver onError. */
          })
        } else {
          queueWorkspaceSave()
        }
        maybeRender()
      },
    })
  }

  const addWorkspaceTab = kind => {
    const normalizedKind =
      kind === 'styles' ? 'styles' : kind === 'component' ? 'component' : ''
    if (!normalizedKind) {
      setStatus('Choose a tab type before adding a tab.', 'neutral')
      return
    }

    const basePath =
      normalizedKind === 'styles' ? 'src/styles/module.css' : 'src/components/module.tsx'
    const language = normalizedKind === 'styles' ? 'css' : 'javascript-jsx'
    const path = makeUniqueTabPath({ basePath })
    const tabId = createWorkspaceTabId(normalizedKind === 'styles' ? 'style' : 'module')
    const name = getPathFileName(path) || `${normalizedKind}-tab`
    const shouldMarkNewTabEdited =
      typeof getShouldShowEditedDesign === 'function'
        ? Boolean(getShouldShowEditedDesign())
        : false

    persistActiveTabEditorContent()

    workspaceTabsState.upsertTab({
      id: tabId,
      name,
      path,
      language,
      role: 'module',
      isActive: false,
      content: '',
      isDirty: shouldMarkNewTabEdited,
      lastModified: Date.now(),
    })

    setWorkspaceTabAddMenuOpen(false)
    setActiveWorkspaceTab(tabId)

    if (normalizedKind === 'styles') {
      setStatus('Added style tab.', 'neutral')
    } else {
      setStatus('Added JavaScript tab.', 'neutral')
    }
  }

  return {
    addWorkspaceTab,
    beginWorkspaceTabRename,
    finishWorkspaceTabRename,
    removeWorkspaceTab,
  }
}

export { createWorkspaceTabMutationsController }
