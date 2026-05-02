const createWorkspaceTabMutationsController = ({
  toNonEmptyWorkspaceText,
  workspaceTabsState,
  setWorkspaceTabRenameState,
  renderWorkspaceTabs,
  setStatus,
  getAllowedEntryTabFileNames,
  getRenderModeValue,
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
  isStyleWorkspaceTab,
  persistActiveTabEditorContent,
  clearTrackedWorkspaceTab,
  trackRemovedWorkspaceTab,
  getActiveWorkspaceTab,
  loadWorkspaceTabIntoEditor,
  getWorkspaceTabByKind,
  setActiveWorkspaceTab,
  makeUniqueTabPath,
  createWorkspaceTabId,
  getShouldShowEditedDesign,
}) => {
  const defaultAllowedEntryTabFileNames = new Set(['app.tsx', 'app.js'])

  const formatAllowedEntryTabNames = allowedEntryTabFileNames => {
    const displayNames = [...allowedEntryTabFileNames].map(fileName =>
      fileName.toLowerCase().startsWith('app.')
        ? `App.${fileName.slice('app.'.length)}`
        : fileName,
    )

    if (displayNames.length <= 1) {
      return displayNames[0] || 'App.tsx'
    }

    if (displayNames.length === 2) {
      return `${displayNames[0]} or ${displayNames[1]}`
    }

    const leading = displayNames.slice(0, -1).join(', ')
    return `${leading}, or ${displayNames[displayNames.length - 1]}`
  }

  const resolveAllowedEntryTabFileNames = () => {
    if (typeof getAllowedEntryTabFileNames !== 'function') {
      return defaultAllowedEntryTabFileNames
    }

    const resolved = getAllowedEntryTabFileNames({
      renderMode:
        typeof getRenderModeValue === 'function' ? getRenderModeValue() : undefined,
    })
    return resolved instanceof Set && resolved.size > 0
      ? resolved
      : defaultAllowedEntryTabFileNames
  }

  const moduleTabTemplates = {
    script: {
      basePath: 'src/components/module.tsx',
      language: 'javascript-jsx',
      idPrefix: 'module',
      defaultName: 'script-tab',
      statusMessage: 'Added JavaScript tab.',
    },
    style: {
      basePath: 'src/styles/module.css',
      language: 'css',
      idPrefix: 'style',
      defaultName: 'style-tab',
      statusMessage: 'Added style tab.',
    },
  }

  const resolveModuleTabTemplate = request => {
    if (request && typeof request === 'object') {
      const type = toNonEmptyWorkspaceText(request.type).toLowerCase()
      if (type === 'style') {
        return moduleTabTemplates.style
      }

      if (type === 'script') {
        return moduleTabTemplates.script
      }
    }

    return null
  }

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
    if (!normalizedNameInput) {
      setStatus('Tab name cannot be empty.', 'error')
      renderWorkspaceTabs()
      return
    }

    const includesDirectory = /[\\/]/.test(normalizedNameInput)
    const nextFileName = getPathFileName(normalizedNameInput) || normalizedNameInput
    const allowedEntryTabFileNames = resolveAllowedEntryTabFileNames()

    if (
      tab.role === 'entry' &&
      !allowedEntryTabFileNames.has(nextFileName.toLowerCase())
    ) {
      setStatus(
        `Entry tab name must be ${formatAllowedEntryTabNames(allowedEntryTabFileNames)}.`,
        'error',
      )
      renderWorkspaceTabs()
      return
    }

    const normalizedEntryPath =
      tab.role === 'entry'
        ? normalizeEntryTabPath(includesDirectory ? normalizedNameInput : tab.path, {
            preferredFileName: includesDirectory
              ? getPathFileName(normalizedNameInput)
              : normalizedNameInput,
            allowedEntryTabFileNames,
          })
        : normalizeModuleTabPathForRename(tab.path, normalizedNameInput)

    const normalizePathForComparison = value =>
      toNonEmptyWorkspaceText(value).replace(/\\/g, '/').replace(/\/+/g, '/')
    const normalizedNextPath = normalizePathForComparison(normalizedEntryPath)
    const hasPathCollision = workspaceTabsState.getTabs().some(existingTab => {
      if (!existingTab || existingTab.id === tab.id) {
        return false
      }

      const existingPath = normalizePathForComparison(existingTab.path)
      const existingTargetPath = normalizePathForComparison(existingTab.targetPrFilePath)
      return (
        (existingPath && existingPath === normalizedNextPath) ||
        (existingTargetPath && existingTargetPath === normalizedNextPath)
      )
    })

    if (hasPathCollision) {
      setStatus('A tab with that file path already exists.', 'error')
      renderWorkspaceTabs()
      return
    }

    const normalizedTabName =
      tab.role === 'entry'
        ? getPathFileName(normalizedEntryPath) || defaultComponentTabName
        : getPathFileName(normalizedEntryPath) || nextFileName
    const didPathChange =
      typeof tab?.path === 'string' && normalizedEntryPath !== tab.path

    workspaceTabsState.upsertTab({
      ...tab,
      name: normalizedTabName,
      path: normalizedEntryPath,
      isDirty:
        didPathChange ||
        getDirtyStateForTabChange(
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
        const removedKind = isStyleWorkspaceTab(tab) ? 'styles' : 'component'
        persistActiveTabEditorContent()
        const removed = workspaceTabsState.removeTab(tab.id)
        if (!removed) {
          return
        }

        if (typeof trackRemovedWorkspaceTab === 'function') {
          trackRemovedWorkspaceTab(tab)
        }

        if (typeof clearTrackedWorkspaceTab === 'function') {
          clearTrackedWorkspaceTab(tab.id)
        }

        const activeTab = getActiveWorkspaceTab()
        if (activeTab) {
          loadWorkspaceTabIntoEditor(activeTab)
        } else {
          const fallbackTab =
            getWorkspaceTabByKind(removedKind) || workspaceTabsState.getTabs()[0] || null
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

  const addWorkspaceTab = request => {
    const template = resolveModuleTabTemplate(request)
    if (!template) {
      setStatus('Choose a tab template before adding a tab.', 'neutral')
      return
    }

    const path = makeUniqueTabPath({ basePath: template.basePath })
    const tabId = createWorkspaceTabId(template.idPrefix)
    const name = getPathFileName(path) || template.defaultName
    const shouldMarkNewTabEdited =
      typeof getShouldShowEditedDesign === 'function'
        ? Boolean(getShouldShowEditedDesign())
        : false

    persistActiveTabEditorContent()

    workspaceTabsState.upsertTab({
      id: tabId,
      name,
      path,
      language: template.language,
      role: 'module',
      isActive: false,
      content: '',
      isDirty: shouldMarkNewTabEdited,
      lastModified: Date.now(),
    })

    setWorkspaceTabAddMenuOpen(false)
    setActiveWorkspaceTab(tabId)
    setStatus(template.statusMessage, 'neutral')
  }

  return {
    addWorkspaceTab,
    beginWorkspaceTabRename,
    finishWorkspaceTabRename,
    removeWorkspaceTab,
  }
}

export { createWorkspaceTabMutationsController }
