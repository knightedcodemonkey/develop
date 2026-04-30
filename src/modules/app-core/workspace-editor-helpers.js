import { isTabEditedForDisplay } from './workspace-tab-edited-display.js'

const createWorkspaceEditorHelpers = ({
  workspaceTabsState,
  isStyleWorkspaceTab,
  editorKinds,
  editorPanelsByKind,
  editorHeaderLabelByKind,
  editorHeaderDirtyStatusByKind,
  getShouldShowEditedDesign,
  defaultTabNameByKind,
  toNonEmptyWorkspaceText,
  getEntryWorkspaceTab,
  getPrimaryStyleWorkspaceTab,
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
  const trackedTabIdByKind = {
    component: toNonEmptyWorkspaceText(getEntryWorkspaceTab()?.id),
    styles: toNonEmptyWorkspaceText(getPrimaryStyleWorkspaceTab()?.id),
  }

  const resolveTabForKind = kind => {
    if (kind !== 'styles' && kind !== 'component') {
      return null
    }

    const isStyleKind = kind === 'styles'

    const activeTab = workspaceTabsState.getTab(workspaceTabsState.getActiveTabId())
    if (activeTab && isStyleWorkspaceTab(activeTab) === isStyleKind) {
      return activeTab
    }

    const trackedTabId = toNonEmptyWorkspaceText(trackedTabIdByKind[kind])
    const trackedTab = trackedTabId ? workspaceTabsState.getTab(trackedTabId) : null
    if (trackedTab && isStyleWorkspaceTab(trackedTab) === isStyleKind) {
      return trackedTab
    }

    return kind === 'styles' ? getPrimaryStyleWorkspaceTab() : getEntryWorkspaceTab()
  }

  const getWorkspaceTabByKind = kind => {
    return resolveTabForKind(kind)
  }

  const clearTrackedWorkspaceTab = tabId => {
    const normalizedTabId = toNonEmptyWorkspaceText(tabId)
    if (!normalizedTabId) {
      return
    }

    if (trackedTabIdByKind.component === normalizedTabId) {
      trackedTabIdByKind.component = toNonEmptyWorkspaceText(getEntryWorkspaceTab()?.id)
    }

    if (trackedTabIdByKind.styles === normalizedTabId) {
      trackedTabIdByKind.styles = toNonEmptyWorkspaceText(
        getPrimaryStyleWorkspaceTab()?.id,
      )
    }
  }

  const syncHeaderLabels = () => {
    for (const editorKind of editorKinds) {
      const tab = resolveTabForKind(editorKind)
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

    const nextContent = isStyleWorkspaceTab(activeTab) ? getCssSource() : getJsxSource()

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

    if (isStyleWorkspaceTab(tab)) {
      trackedTabIdByKind.styles = tab.id
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
      trackedTabIdByKind.component = tab.id
      setSuppressEditorChangeSideEffects(true)
      try {
        setJsxSource(nextContent)

        const stylesTab = resolveTabForKind('styles')
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
    clearTrackedWorkspaceTab,
    getWorkspaceTabByKind,
    syncHeaderLabels,
    persistActiveTabEditorContent,
    setVisibleEditorPanelForKind,
    loadWorkspaceTabIntoEditor,
  }
}

export { createWorkspaceEditorHelpers }
