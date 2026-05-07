import { createWorkspaceShareUrlImporter } from './workspace-share-url-import.js'

const bindAppEventsAndStart = ({
  editorUi,
  diagnosticsUi,
  sourceActions,
  workspaceUi,
  themeUi,
  githubUi,
  panelUi,
  lifecycle,
  startup,
}) => {
  const {
    renderMode,
    styleMode,
    autoRenderToggle,
    renderButton,
    typecheckButton,
    lintComponentButton,
    lintStylesButton,
    copyComponentButton,
    copyStylesButton,
    clearConfirmDialog,
    clearComponentButton,
    clearStylesButton,
    jsxEditor,
    cssEditor,
  } = editorUi
  const {
    diagnosticsToggle,
    diagnosticsClose,
    diagnosticsClearComponent,
    diagnosticsClearStyles,
    diagnosticsClearAll,
    statusNode,
  } = diagnosticsUi
  const {
    applyRenderMode,
    applyStyleMode,
    updateRenderButtonVisibility,
    clearDiagnosticsScope,
    clearComponentLintDiagnosticsState,
    clearStylesLintDiagnosticsState,
    clearAllDiagnostics,
    setStatus,
    getJsxSource,
    getCssSource,
    getTypecheckSourcePath,
    runComponentLint,
    runStylesLint,
    renderPreview,
    setJsxSource,
    setCssSource,
    persistActiveTabEditorContent,
    getWorkspaceTabsSnapshot,
    queueWorkspaceSave,
    maybeRender,
    maybeRenderFromComponentEditorChange,
    markTypeDiagnosticsStale,
    markComponentLintDiagnosticsStale,
    markStylesLintDiagnosticsStale,
    flushWorkspaceSave,
    confirmAction,
    getPendingClearAction,
    setPendingClearAction,
    getDiagnosticsDrawerOpen,
    setDiagnosticsDrawerOpen,
    setTypeDiagnosticsDetails,
    setCdnLoading,
  } = sourceActions
  const {
    workspaceTabAddMenuUi,
    workspaceTabAddButton,
    workspaceTabAddModule,
    workspaceTabAddStyles,
    addWorkspaceTab,
    syncHeaderLabels,
    renderWorkspaceTabs,
    refreshLocalContextOptions,
    applyWorkspaceRecord,
    updateRenderModeEditability,
    loadPreferredWorkspaceContext,
    getActiveWorkspaceTab,
    isStyleWorkspaceTab,
    setActiveWorkspaceTab,
    getPrimaryStyleWorkspaceTab,
    workspaceSaveController,
    workspaceStorage,
    createWorkspaceRecordId,
    syncDiagnosticsDrawerLayout,
    setHasCompletedInitialWorkspaceBootstrap,
  } = workspaceUi
  const { appThemeButtons, applyTheme, getInitialTheme, getInitialRenderMode } = themeUi
  const {
    aiControlsToggle,
    compactAiControlsUi,
    githubTokenInfo,
    githubTokenInfoPanel,
    githubTokenInfoUi,
    prContextUi,
    githubAiContextState,
  } = githubUi
  const {
    editorToolsButtons,
    panelToolsState,
    applyEditorToolsVisibility,
    panelCollapseButtons,
    togglePanelCollapse,
    applyPanelCollapseState,
  } = panelUi
  const {
    clearToastTimer,
    diagnosticsFlowController,
    chatDrawerController,
    prDrawerController,
  } = lifecycle
  const {
    renderRuntime,
    typeDiagnostics,
    clipboardSupported,
    previewBackground,
    initializeCodeEditors,
  } = startup

  const importWorkspaceFromShareUrl = createWorkspaceShareUrlImporter({
    workspaceStorage,
    applyWorkspaceRecord,
    refreshLocalContextOptions,
    createWorkspaceRecordId,
  })
  const clearComponentSource = () => {
    setJsxSource('')
    clearDiagnosticsScope('component')
    typeDiagnostics.clearTypeDiagnosticsState()
    clearComponentLintDiagnosticsState()
    setStatus('Component cleared', 'neutral')
    renderRuntime.clearPreview()
    queueWorkspaceSave()
  }

  const clearStylesSource = () => {
    setCssSource('')
    clearDiagnosticsScope('styles')
    clearStylesLintDiagnosticsState()
    setStatus('Styles cleared', 'neutral')
    maybeRender()
    queueWorkspaceSave()
  }

  const confirmClearSource = ({ label, onConfirm }) => {
    confirmAction({
      title: `Clear ${label} source?`,
      copy: 'This action will remove all text from the editor. This cannot be undone.',
      onConfirm,
    })
  }

  const copyTextToClipboard = async text => {
    if (!clipboardSupported) {
      throw new Error('Clipboard API is not available in this browser context.')
    }

    await navigator.clipboard.writeText(text)
  }

  const copyComponentSource = async () => {
    try {
      await copyTextToClipboard(getJsxSource())
      setStatus('Component copied', 'neutral')
    } catch {
      setStatus('Copy failed', 'error')
    }
  }

  const copyStylesSource = async () => {
    try {
      await copyTextToClipboard(getCssSource())
      setStatus('Styles copied', 'neutral')
    } catch {
      setStatus('Copy failed', 'error')
    }
  }

  const syncAndCaptureDiagnosticsSnapshot = () => {
    persistActiveTabEditorContent()

    const activeTab = getActiveWorkspaceTab()
    const tabsSnapshot = getWorkspaceTabsSnapshot()

    return {
      activeTab,
      tabsSnapshot,
    }
  }

  renderMode.addEventListener('change', () => {
    applyRenderMode({ mode: renderMode.value })
  })
  styleMode.addEventListener('change', () => {
    applyStyleMode({ mode: styleMode.value })
  })
  autoRenderToggle.addEventListener('change', () => {
    renderRuntime.clearPreview()
    updateRenderButtonVisibility()
    if (autoRenderToggle.checked) {
      renderPreview()
    }
  })
  if (diagnosticsToggle) {
    diagnosticsToggle.addEventListener('click', () => {
      setDiagnosticsDrawerOpen(!getDiagnosticsDrawerOpen())
    })
  }
  if (diagnosticsClose) {
    diagnosticsClose.addEventListener('click', () => {
      setDiagnosticsDrawerOpen(false)
    })
  }
  if (diagnosticsClearComponent) {
    diagnosticsClearComponent.addEventListener('click', () => {
      clearDiagnosticsScope('component')
      typeDiagnostics.clearTypeDiagnosticsState()
      clearComponentLintDiagnosticsState()
      if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
        setStatus('Rendered', 'neutral')
      }
    })
  }
  if (diagnosticsClearStyles) {
    diagnosticsClearStyles.addEventListener('click', () => {
      clearDiagnosticsScope('styles')
      clearStylesLintDiagnosticsState()
      clearComponentLintDiagnosticsState()
    })
  }
  if (diagnosticsClearAll) {
    diagnosticsClearAll.addEventListener('click', () => {
      clearAllDiagnostics()
      typeDiagnostics.clearTypeDiagnosticsState()
      clearComponentLintDiagnosticsState()
      clearStylesLintDiagnosticsState()
      if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
        setStatus('Rendered', 'neutral')
      }
    })
  }
  if (typecheckButton) {
    typecheckButton.addEventListener('click', () => {
      const { activeTab, tabsSnapshot } = syncAndCaptureDiagnosticsSnapshot()
      const source =
        !isStyleWorkspaceTab(activeTab) && typeof activeTab?.content === 'string'
          ? activeTab.content
          : getJsxSource()
      const sourcePath =
        !isStyleWorkspaceTab(activeTab) && typeof activeTab?.path === 'string'
          ? activeTab.path
          : getTypecheckSourcePath()

      typeDiagnostics.triggerTypeDiagnostics({
        userInitiated: true,
        source,
        sourcePath,
        workspaceTabs: tabsSnapshot,
      })
    })
  }
  if (lintComponentButton) {
    lintComponentButton.addEventListener('click', () => {
      const { activeTab } = syncAndCaptureDiagnosticsSnapshot()
      const source =
        !isStyleWorkspaceTab(activeTab) && typeof activeTab?.content === 'string'
          ? activeTab.content
          : getJsxSource()

      void runComponentLint({
        userInitiated: true,
        source,
      })
    })
  }
  if (lintStylesButton) {
    lintStylesButton.addEventListener('click', () => {
      const { activeTab } = syncAndCaptureDiagnosticsSnapshot()
      const source =
        isStyleWorkspaceTab(activeTab) && typeof activeTab?.content === 'string'
          ? activeTab.content
          : getCssSource()

      void runStylesLint({
        userInitiated: true,
        source,
      })
    })
  }
  renderButton.addEventListener('click', renderPreview)
  if (clipboardSupported) {
    copyComponentButton.addEventListener('click', () => {
      void copyComponentSource()
    })
    copyStylesButton.addEventListener('click', () => {
      void copyStylesSource()
    })
  } else {
    copyComponentButton.hidden = true
    copyStylesButton.hidden = true
  }
  if (clearConfirmDialog instanceof HTMLDialogElement) {
    clearConfirmDialog.addEventListener('close', () => {
      if (clearConfirmDialog.returnValue === 'confirm') {
        getPendingClearAction()?.()
      }
      setPendingClearAction(null)
    })
  }

  clearComponentButton.addEventListener('click', () => {
    confirmClearSource({
      label: 'Component',
      onConfirm: clearComponentSource,
    })
  })

  clearStylesButton.addEventListener('click', () => {
    confirmClearSource({
      label: 'Styles',
      onConfirm: clearStylesSource,
    })
  })

  jsxEditor.addEventListener('input', maybeRenderFromComponentEditorChange)
  jsxEditor.addEventListener('input', markTypeDiagnosticsStale)
  jsxEditor.addEventListener('input', markComponentLintDiagnosticsStale)
  jsxEditor.addEventListener('input', queueWorkspaceSave)
  jsxEditor.addEventListener('blur', () => {
    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
  })
  cssEditor.addEventListener('input', maybeRender)
  cssEditor.addEventListener('input', markStylesLintDiagnosticsStale)
  cssEditor.addEventListener('input', queueWorkspaceSave)
  cssEditor.addEventListener('blur', () => {
    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
  })

  for (const button of appThemeButtons) {
    button.addEventListener('click', () => {
      const nextTheme = button.dataset.appTheme
      if (!nextTheme) {
        return
      }
      applyTheme(nextTheme)
    })
  }

  if (aiControlsToggle instanceof HTMLButtonElement) {
    aiControlsToggle.addEventListener('click', () => {
      if (!compactAiControlsUi.isCompactViewport()) {
        return
      }

      compactAiControlsUi.toggle()
    })
  }

  if (githubTokenInfo instanceof HTMLButtonElement && githubTokenInfoPanel) {
    githubTokenInfo.addEventListener('click', event => {
      event.preventDefault()
      githubTokenInfoUi.toggle()
    })
  }

  document.addEventListener('click', event => {
    const clickTarget = event.target
    if (!(clickTarget instanceof Node)) {
      return
    }

    compactAiControlsUi.handleDocumentClick(clickTarget)

    if (githubTokenInfoUi.shouldCloseForClickTarget(clickTarget)) {
      githubTokenInfoUi.close()
    }
  })

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
      return
    }

    compactAiControlsUi.setOpen(false)
    githubTokenInfoUi.close()
  })

  for (const button of editorToolsButtons) {
    button.addEventListener('click', () => {
      const panelName = button.dataset.editorToolsToggle
      if (!panelName || !Object.hasOwn(panelToolsState, panelName)) {
        return
      }

      panelToolsState[panelName] = !panelToolsState[panelName]
      applyEditorToolsVisibility()
    })
  }

  for (const button of panelCollapseButtons) {
    button.addEventListener('click', () => {
      const panelName = button.dataset.panelCollapse
      if (!panelName) {
        return
      }

      togglePanelCollapse(panelName)
    })
  }

  const handleCompactViewportChange = () => {
    applyPanelCollapseState()
    compactAiControlsUi.setOpen(false)
  }
  compactAiControlsUi.onViewportChange(handleCompactViewportChange)

  const shouldForceReloadOnBfCacheRestore =
    typeof navigator !== 'undefined' && navigator.webdriver !== true

  window.addEventListener('pageshow', event => {
    if (!event.persisted || !shouldForceReloadOnBfCacheRestore) {
      return
    }

    /* BFCache restore can leave CodeMirror styles partially detached. */
    window.location.reload()
  })

  window.addEventListener('beforeunload', () => {
    clearToastTimer()
    diagnosticsFlowController.dispose()
    workspaceSaveController.dispose()
    void workspaceStorage.close()
    chatDrawerController.dispose()
    prDrawerController.dispose()
  })

  document.addEventListener('pointerdown', event => {
    workspaceTabAddMenuUi.handleDocumentPointerdown(event.target)
  })

  document.addEventListener('keydown', event => {
    workspaceTabAddMenuUi.handleEscape(event)
  })

  if (workspaceTabAddButton instanceof HTMLButtonElement) {
    workspaceTabAddButton.addEventListener('click', event => {
      event.stopPropagation()
      workspaceTabAddMenuUi.toggle()
    })

    workspaceTabAddButton.addEventListener('keydown', event => {
      workspaceTabAddMenuUi.handleAddButtonKeydown(event)
    })
  }

  if (workspaceTabAddModule instanceof HTMLButtonElement) {
    workspaceTabAddModule.addEventListener('click', event => {
      event.stopPropagation()
      addWorkspaceTab({ type: 'script' })
    })
  }

  if (workspaceTabAddStyles instanceof HTMLButtonElement) {
    workspaceTabAddStyles.addEventListener('click', event => {
      event.stopPropagation()
      addWorkspaceTab({ type: 'style' })
    })
  }

  applyTheme(getInitialTheme(), { persist: false })
  renderMode.value = getInitialRenderMode()
  applyEditorToolsVisibility()
  applyPanelCollapseState()
  syncHeaderLabels()
  renderWorkspaceTabs()
  updateRenderModeEditability()
  compactAiControlsUi.setOpen(false)
  githubTokenInfoUi.close()
  prContextUi.syncAiChatTokenVisibility(githubAiContextState.token)

  updateRenderButtonVisibility()
  setDiagnosticsDrawerOpen(false)
  setTypeDiagnosticsDetails({ headline: '' })
  syncDiagnosticsDrawerLayout()
  renderRuntime.setStyleCompiling(false)
  setCdnLoading(true)
  previewBackground.initializePreviewBackgroundPicker()
  const workspaceRestoreReady = (async () => {
    try {
      const didImportSharedWorkspace = await importWorkspaceFromShareUrl()
      if (didImportSharedWorkspace) {
        return
      }
    } catch {
      setStatus('Could not import shared workspace context.', 'error')
    }

    await loadPreferredWorkspaceContext()
  })().catch(() => {
    setStatus('Could not restore local workspace context.', 'neutral')
  })
  void initializeCodeEditors().then(async () => {
    await workspaceRestoreReady

    const activeTab = getActiveWorkspaceTab()
    if (activeTab) {
      setActiveWorkspaceTab(activeTab.id)
      syncDiagnosticsDrawerLayout()
    }

    if (!isStyleWorkspaceTab(activeTab)) {
      const stylesTab = getPrimaryStyleWorkspaceTab()
      if (stylesTab && typeof stylesTab.content === 'string') {
        setCssSource(stylesTab.content)
      }
    }

    setHasCompletedInitialWorkspaceBootstrap(true)
    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
    prDrawerController.syncRepositories()
    await renderPreview()
  })
}

export { bindAppEventsAndStart }
