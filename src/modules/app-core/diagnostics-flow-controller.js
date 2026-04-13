const createDiagnosticsFlowController = ({
  createTypeDiagnosticsController,
  createLintDiagnosticsController,
  cdnImports,
  importFromCdnWithFallback,
  getTypeScriptLibUrls,
  getTypePackageFileUrls,
  getJsxSource,
  getCssSource,
  getTypecheckSourcePath,
  getWorkspaceTabs,
  getRenderMode,
  getStyleMode,
  setTypeDiagnosticsDetails,
  setTypeDiagnosticsPending,
  setStyleDiagnosticsDetails,
  setLintDiagnosticsPending,
  setStatus,
  statusNode,
  incrementTypeDiagnosticsRuns,
  decrementTypeDiagnosticsRuns,
  getActiveTypeDiagnosticsRuns,
  incrementLintDiagnosticsRuns,
  decrementLintDiagnosticsRuns,
  setDiagnosticsDrawerOpen,
  clearAllDiagnostics,
  lintComponentButton,
  lintStylesButton,
  autoRenderToggle,
  getActiveWorkspaceTab,
  getTabKind,
  getRenderRuntime,
}) => {
  let activeComponentLintAbortController = null
  let activeStylesLintAbortController = null
  let lastComponentLintIssueCount = 0
  let lastStylesLintIssueCount = 0
  let scheduledComponentLintRecheck = null
  let scheduledStylesLintRecheck = null
  let componentLintPending = false
  let stylesLintPending = false

  const setTypecheckButtonLoading = isLoading => {
    const runtimeTypecheckButton = document.getElementById('typecheck-button')
    if (!(runtimeTypecheckButton instanceof HTMLButtonElement)) {
      return
    }

    runtimeTypecheckButton.classList.toggle('render-button--loading', isLoading)
    runtimeTypecheckButton.setAttribute('aria-busy', isLoading ? 'true' : 'false')
    runtimeTypecheckButton.disabled = isLoading
  }

  const setLintButtonLoading = ({ button, isLoading }) => {
    if (!(button instanceof HTMLButtonElement)) {
      return
    }

    button.classList.toggle('render-button--loading', isLoading)
    button.setAttribute('aria-busy', isLoading ? 'true' : 'false')
    button.disabled = isLoading
  }

  const typeDiagnostics = createTypeDiagnosticsController({
    cdnImports,
    importFromCdnWithFallback,
    getTypeScriptLibUrls,
    getTypePackageFileUrls,
    getJsxSource,
    getTypecheckSourcePath,
    getWorkspaceTabs,
    getRenderMode,
    setTypecheckButtonLoading,
    setTypeDiagnosticsDetails,
    setTypeDiagnosticsPending,
    setStatus,
    setRenderedStatus: () => {
      if (typeDiagnostics.getLastTypeErrorCount() > 0) {
        setStatus(
          `Rendered (Type errors: ${typeDiagnostics.getLastTypeErrorCount()})`,
          'error',
        )
        return
      }

      if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
        setStatus('Rendered', 'neutral')
      }
    },
    isRenderedStatus: () =>
      statusNode.textContent === 'Rendered' ||
      statusNode.textContent.startsWith('Rendered (Type errors:'),
    isRenderedTypeErrorStatus: () =>
      statusNode.textContent.startsWith('Rendered (Type errors:'),
    incrementTypeDiagnosticsRuns,
    decrementTypeDiagnosticsRuns,
    getActiveTypeDiagnosticsRuns,
    onIssuesDetected: ({ issueCount }) => {
      if (issueCount > 0) {
        setDiagnosticsDrawerOpen(true)
      }
    },
  })

  const setRenderedStatus = () => {
    if (typeDiagnostics.getLastTypeErrorCount() > 0) {
      setStatus(
        `Rendered (Type errors: ${typeDiagnostics.getLastTypeErrorCount()})`,
        'error',
      )
      return
    }

    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered', 'neutral')
    }
  }

  const lintDiagnostics = createLintDiagnosticsController({
    cdnImports,
    importFromCdnWithFallback,
    getComponentSource: getJsxSource,
    getStylesSource: getCssSource,
    getStyleMode,
    setComponentDiagnostics: setTypeDiagnosticsDetails,
    setStyleDiagnostics: setStyleDiagnosticsDetails,
    setStatus,
    onIssuesDetected: ({ issueCount }) => {
      if (issueCount > 0) {
        setDiagnosticsDrawerOpen(true)
      }
    },
  })

  const clearComponentLintRecheckTimer = () => {
    if (scheduledComponentLintRecheck) {
      clearTimeout(scheduledComponentLintRecheck)
      scheduledComponentLintRecheck = null
    }
  }

  const clearStylesLintRecheckTimer = () => {
    if (scheduledStylesLintRecheck) {
      clearTimeout(scheduledStylesLintRecheck)
      scheduledStylesLintRecheck = null
    }
  }

  const syncLintPendingState = () => {
    setLintDiagnosticsPending(componentLintPending || stylesLintPending)
  }

  const runComponentLint = ({ userInitiated = false, source = undefined } = {}) => {
    activeComponentLintAbortController?.abort()
    const controller = new AbortController()
    activeComponentLintAbortController = controller
    componentLintPending = false
    syncLintPendingState()
    incrementLintDiagnosticsRuns()

    setLintButtonLoading({ button: lintComponentButton, isLoading: true })

    return lintDiagnostics
      .lintComponent({
        signal: controller.signal,
        userInitiated,
        source,
      })
      .then(result => {
        if (result) {
          lastComponentLintIssueCount = result.issueCount
        }
        return result
      })
      .finally(() => {
        decrementLintDiagnosticsRuns()
        if (activeComponentLintAbortController === controller) {
          activeComponentLintAbortController = null
          setLintButtonLoading({ button: lintComponentButton, isLoading: false })
        }
      })
  }

  const runStylesLint = ({ userInitiated = false, source = undefined } = {}) => {
    activeStylesLintAbortController?.abort()
    const controller = new AbortController()
    activeStylesLintAbortController = controller
    stylesLintPending = false
    syncLintPendingState()
    incrementLintDiagnosticsRuns()

    setLintButtonLoading({ button: lintStylesButton, isLoading: true })

    return lintDiagnostics
      .lintStyles({
        signal: controller.signal,
        userInitiated,
        source,
      })
      .then(result => {
        if (result) {
          lastStylesLintIssueCount = result.issueCount
        }
        return result
      })
      .finally(() => {
        decrementLintDiagnosticsRuns()
        if (activeStylesLintAbortController === controller) {
          activeStylesLintAbortController = null
          setLintButtonLoading({ button: lintStylesButton, isLoading: false })
        }
      })
  }

  const markTypeDiagnosticsStale = () => {
    typeDiagnostics.markTypeDiagnosticsStale()
  }

  const markComponentLintDiagnosticsStale = () => {
    clearComponentLintRecheckTimer()

    if (lastComponentLintIssueCount > 0) {
      componentLintPending = true
      syncLintPendingState()
      setTypeDiagnosticsDetails({
        headline: 'Source changed. Re-checking lint issues…',
        level: 'muted',
      })

      scheduledComponentLintRecheck = setTimeout(() => {
        scheduledComponentLintRecheck = null
        void runComponentLint()
      }, 450)
      return
    }

    componentLintPending = false
    syncLintPendingState()
    setTypeDiagnosticsDetails({
      headline: 'Source changed. Click Lint to run diagnostics.',
      level: 'muted',
    })

    if (statusNode.textContent.startsWith('Rendered (Lint issues:')) {
      setStatus('Rendered', 'neutral')
    }
  }

  const markStylesLintDiagnosticsStale = () => {
    clearStylesLintRecheckTimer()

    if (lastStylesLintIssueCount > 0) {
      stylesLintPending = true
      syncLintPendingState()
      setStyleDiagnosticsDetails({
        headline: 'Source changed. Re-checking lint issues…',
        level: 'muted',
      })

      scheduledStylesLintRecheck = setTimeout(() => {
        scheduledStylesLintRecheck = null
        void runStylesLint()
      }, 450)
      return
    }

    stylesLintPending = false
    syncLintPendingState()
    setStyleDiagnosticsDetails({
      headline: 'Source changed. Click Lint to run diagnostics.',
      level: 'muted',
    })

    if (statusNode.textContent.startsWith('Rendered (Lint issues:')) {
      setStatus('Rendered', 'neutral')
    }
  }

  const clearComponentLintDiagnosticsState = () => {
    lastComponentLintIssueCount = 0
    componentLintPending = false
    clearComponentLintRecheckTimer()
    syncLintPendingState()
  }

  const clearStylesLintDiagnosticsState = () => {
    lastStylesLintIssueCount = 0
    stylesLintPending = false
    clearStylesLintRecheckTimer()
    syncLintPendingState()
  }

  const resetDiagnosticsFlow = () => {
    activeComponentLintAbortController?.abort()
    activeStylesLintAbortController?.abort()
    activeComponentLintAbortController = null
    activeStylesLintAbortController = null

    lintDiagnostics.cancelAll()
    typeDiagnostics.cancelTypeDiagnostics()
    clearComponentLintDiagnosticsState()
    clearStylesLintDiagnosticsState()
    clearAllDiagnostics()

    setLintButtonLoading({ button: lintComponentButton, isLoading: false })
    setLintButtonLoading({ button: lintStylesButton, isLoading: false })
    setStatus('Rendered', 'neutral')
  }

  const dispose = () => {
    activeComponentLintAbortController?.abort()
    activeStylesLintAbortController?.abort()
    activeComponentLintAbortController = null
    activeStylesLintAbortController = null
    clearComponentLintRecheckTimer()
    clearStylesLintRecheckTimer()
    lintDiagnostics.dispose()
  }

  const renderPreview = async () => {
    await getRenderRuntime()?.renderPreview()
  }

  const maybeRender = () => {
    if (autoRenderToggle.checked) {
      getRenderRuntime()?.scheduleRender()
    }
  }

  const maybeRenderFromComponentEditorChange = () => {
    if (!autoRenderToggle.checked) {
      return
    }

    const activeTab = getActiveWorkspaceTab()
    if (activeTab && getTabKind(activeTab) === 'component') {
      const shouldRender = getRenderRuntime()?.shouldAutoRenderForTabChange(activeTab.id)
      if (!shouldRender) {
        return
      }
    }

    getRenderRuntime()?.scheduleRender()
  }

  return {
    clearComponentLintDiagnosticsState,
    clearStylesLintDiagnosticsState,
    dispose,
    lintDiagnostics,
    markComponentLintDiagnosticsStale,
    markStylesLintDiagnosticsStale,
    markTypeDiagnosticsStale,
    maybeRender,
    maybeRenderFromComponentEditorChange,
    renderPreview,
    resetDiagnosticsFlow,
    runComponentLint,
    runStylesLint,
    setRenderedStatus,
    typeDiagnostics,
  }
}

export { createDiagnosticsFlowController }
