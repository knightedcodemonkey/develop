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
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    workspaceTabAddMenuUi,
    workspaceTabAddButton,
    workspaceTabAddModule,
    workspaceTabAddStyles,
    addWorkspaceTab,
    syncHeaderLabels,
    renderWorkspaceTabs,
    updateRenderModeEditability,
    loadPreferredWorkspaceContext,
    getActiveWorkspaceTab,
    setActiveWorkspaceTab,
    workspaceTabsState,
    loadedStylesTabIdRef,
    getWorkspaceTabByKind,
    workspaceSaveController,
    workspaceStorage,
    bindWorkspaceMetadataPersistence,
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
      typeDiagnostics.triggerTypeDiagnostics({
        userInitiated: true,
        source: getJsxSource(),
        sourcePath: getTypecheckSourcePath(),
      })
    })
  }
  if (lintComponentButton) {
    lintComponentButton.addEventListener('click', () => {
      void runComponentLint({
        userInitiated: true,
        source: getJsxSource(),
      })
    })
  }
  if (lintStylesButton) {
    lintStylesButton.addEventListener('click', () => {
      void runStylesLint({
        userInitiated: true,
        source: getCssSource(),
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

  for (const element of [githubPrBaseBranch, githubPrHeadBranch, githubPrTitle]) {
    bindWorkspaceMetadataPersistence(element)
  }

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

  window.addEventListener('beforeunload', () => {
    clearToastTimer()
    diagnosticsFlowController.dispose()
    void flushWorkspaceSave().catch(() => {
      /* noop */
    })
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
      addWorkspaceTab('component')
    })
  }

  if (workspaceTabAddStyles instanceof HTMLButtonElement) {
    workspaceTabAddStyles.addEventListener('click', event => {
      event.stopPropagation()
      addWorkspaceTab('styles')
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
  renderRuntime.setStyleCompiling(false)
  setCdnLoading(true)
  previewBackground.initializePreviewBackgroundPicker()
  const workspaceRestoreReady = loadPreferredWorkspaceContext().catch(() => {
    setStatus('Could not restore local workspace context.', 'neutral')
  })
  void initializeCodeEditors().then(async () => {
    await workspaceRestoreReady

    const activeTab = getActiveWorkspaceTab()
    if (activeTab) {
      setActiveWorkspaceTab(activeTab.id)
    }

    const stylesTab =
      workspaceTabsState.getTab(loadedStylesTabIdRef.value) ??
      getWorkspaceTabByKind('styles')
    if (stylesTab && typeof stylesTab.content === 'string') {
      setCssSource(stylesTab.content)
    }

    setHasCompletedInitialWorkspaceBootstrap(true)
    await renderPreview()
  })
}

export { bindAppEventsAndStart }
