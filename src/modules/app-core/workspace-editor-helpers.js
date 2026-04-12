const createWorkspaceEditorHelpers = ({
  workspaceTabsState,
  getTabKind,
  editorKinds,
  editorPanelsByKind,
  editorHeaderLabelByKind,
  defaultTabNameByKind,
  toNonEmptyWorkspaceText,
  getLoadedStylesTabId,
  getLoadedComponentTabId,
  setLoadedStylesTabId,
  setLoadedComponentTabId,
  getCssSource,
  getJsxSource,
  getDirtyStateForTabChange,
  setCssSource,
  setJsxSource,
  styleMode,
  toStyleModeForTabLanguage,
  getStyleEditorLanguage,
  getCssCodeEditor,
  setSuppressEditorChangeSideEffects,
  editorPool,
}) => {
  const getWorkspaceTabByKind = kind => {
    const tabs = workspaceTabsState.getTabs()
    const normalizedKind = kind === 'styles' ? 'styles' : 'component'
    return (
      tabs.find(
        tab =>
          getTabKind(tab) === normalizedKind &&
          tab.id === workspaceTabsState.getActiveTabId(),
      ) ??
      tabs.find(tab => getTabKind(tab) === normalizedKind) ??
      null
    )
  }

  const syncHeaderLabels = () => {
    for (const editorKind of editorKinds) {
      const tab =
        editorKind === 'styles'
          ? (workspaceTabsState.getTab(getLoadedStylesTabId()) ??
            getWorkspaceTabByKind('styles'))
          : (workspaceTabsState.getTab(getLoadedComponentTabId()) ??
            getWorkspaceTabByKind('component'))
      const headerLabel = editorHeaderLabelByKind[editorKind]

      if (headerLabel) {
        headerLabel.textContent =
          toNonEmptyWorkspaceText(tab?.name) || defaultTabNameByKind[editorKind]
      }
    }
  }

  const persistActiveTabEditorContent = () => {
    const activeTab = workspaceTabsState.getTab(workspaceTabsState.getActiveTabId())

    if (!activeTab) {
      return
    }

    const nextContent =
      getTabKind(activeTab) === 'styles' ? getCssSource() : getJsxSource()

    if (nextContent === activeTab.content) {
      return
    }

    workspaceTabsState.upsertTab(
      {
        ...activeTab,
        content: nextContent,
        isDirty: getDirtyStateForTabChange(activeTab, nextContent),
        lastModified: Date.now(),
        isActive: true,
      },
      { emitReason: 'tabContentSync' },
    )
  }

  const setVisibleEditorPanelForKind = kind => {
    const nextVisibleKind = kind === 'styles' ? 'styles' : 'component'

    for (const editorKind of editorKinds) {
      const panel = editorPanelsByKind[editorKind]
      if (!panel) {
        continue
      }

      if (editorKind === nextVisibleKind) {
        panel.removeAttribute('hidden')
        continue
      }

      panel.setAttribute('hidden', '')
    }
  }

  const loadWorkspaceTabIntoEditor = tab => {
    if (!tab || typeof tab !== 'object') {
      return
    }

    const nextContent = typeof tab.content === 'string' ? tab.content : ''

    if (getTabKind(tab) === 'styles') {
      setLoadedStylesTabId(tab.id)
      setCssSource(nextContent)
      const nextStyleMode = toStyleModeForTabLanguage({
        language: tab.language,
        toNonEmptyWorkspaceText,
      })
      if (styleMode.value !== nextStyleMode) {
        styleMode.value = nextStyleMode
      }
      const cssCodeEditor = getCssCodeEditor()
      if (cssCodeEditor) {
        setSuppressEditorChangeSideEffects(true)
        try {
          cssCodeEditor.setLanguage(getStyleEditorLanguage(nextStyleMode))
        } finally {
          setSuppressEditorChangeSideEffects(false)
        }
      }
      setVisibleEditorPanelForKind('styles')
      editorPool.activate('styles')
    } else {
      setLoadedComponentTabId(tab.id)
      setJsxSource(nextContent)
      setVisibleEditorPanelForKind('component')
      editorPool.activate('component')
    }

    syncHeaderLabels()
  }

  return {
    getWorkspaceTabByKind,
    syncHeaderLabels,
    persistActiveTabEditorContent,
    setVisibleEditorPanelForKind,
    loadWorkspaceTabIntoEditor,
  }
}

export { createWorkspaceEditorHelpers }
