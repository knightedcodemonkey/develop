import { isTabEditedForDisplay } from './workspace-tab-edited-display.js'

const createWorkspaceEditorHelpers = ({
  workspaceTabsState,
  getTabKind,
  editorKinds,
  editorPanelsByKind,
  editorHeaderLabelByKind,
  editorHeaderDirtyStatusByKind,
  getShouldShowEditedDesign,
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
      const dirtyStatusLabel = editorHeaderDirtyStatusByKind[editorKind]

      if (headerLabel) {
        headerLabel.textContent =
          toNonEmptyWorkspaceText(tab?.name) || defaultTabNameByKind[editorKind]
      }

      if (dirtyStatusLabel instanceof HTMLElement) {
        const shouldShowEditedDesign =
          typeof getShouldShowEditedDesign === 'function'
            ? Boolean(getShouldShowEditedDesign())
            : true
        const isDirty = shouldShowEditedDesign && isTabEditedForDisplay(tab)
        dirtyStatusLabel.hidden = !isDirty
        if (isDirty) {
          dirtyStatusLabel.removeAttribute('aria-hidden')
        } else {
          dirtyStatusLabel.setAttribute('aria-hidden', 'true')
        }
      }
    }
  }

  const persistActiveTabEditorContent = () => {
    const activeTab = workspaceTabsState.getTab(workspaceTabsState.getActiveTabId())

    if (!activeTab) {
      return
    }

    const activeTabKind = getTabKind(activeTab)
    const loadedTabId =
      activeTabKind === 'styles' ? getLoadedStylesTabId() : getLoadedComponentTabId()
    const loadedTab = loadedTabId ? workspaceTabsState.getTab(loadedTabId) : null
    const targetTab =
      loadedTab && getTabKind(loadedTab) === activeTabKind ? loadedTab : activeTab

    const nextContent = activeTabKind === 'styles' ? getCssSource() : getJsxSource()

    if (nextContent === targetTab.content) {
      return
    }

    workspaceTabsState.upsertTab(
      {
        ...targetTab,
        content: nextContent,
        isDirty: getDirtyStateForTabChange(targetTab, nextContent),
        lastModified: Date.now(),
        isActive: targetTab.id === activeTab.id,
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

    const applyStyleLanguage = language => {
      const nextStyleMode = toStyleModeForTabLanguage({
        language,
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
    }

    if (getTabKind(tab) === 'styles') {
      setLoadedStylesTabId(tab.id)
      setSuppressEditorChangeSideEffects(true)
      try {
        setCssSource(nextContent)
        applyStyleLanguage(tab.language)
      } finally {
        setSuppressEditorChangeSideEffects(false)
      }
      setVisibleEditorPanelForKind('styles')
      editorPool.activate('styles')
    } else {
      setLoadedComponentTabId(tab.id)
      setSuppressEditorChangeSideEffects(true)
      try {
        setJsxSource(nextContent)

        const stylesTab =
          workspaceTabsState.getTab(getLoadedStylesTabId()) ??
          getWorkspaceTabByKind('styles')
        if (stylesTab) {
          applyStyleLanguage(stylesTab.language)
        }
      } finally {
        setSuppressEditorChangeSideEffects(false)
      }

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
