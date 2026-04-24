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
  getComponentLintTarget = () => null,
  getStylesLintTarget = () => null,
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
  let scheduledComponentLintRecheck = null
  let scheduledStylesLintRecheck = null
  let componentLintPending = false
  let stylesLintPending = false
  let componentLintSourceVersion = 0
  let stylesLintSourceVersion = 0

  const normalizeLintTargetIdentity = target => {
    const tabId = typeof target?.tabId === 'string' ? target.tabId.trim() : ''
    const path = typeof target?.path === 'string' ? target.path.trim() : ''
    const language =
      typeof target?.language === 'string' ? target.language.trim().toLowerCase() : ''

    return {
      tabId,
      path,
      language,
      key: `${tabId}|${path}|${language}`,
    }
  }

  const getCurrentLintTargetIdentity = scope => {
    const resolveTarget =
      scope === 'styles' ? getStylesLintTarget : getComponentLintTarget
    return normalizeLintTargetIdentity(resolveTarget())
  }

  const createLintRunContext = scope => {
    const target = getCurrentLintTargetIdentity(scope)
    const sourceVersion =
      scope === 'styles' ? stylesLintSourceVersion : componentLintSourceVersion

    return {
      scope,
      sourceVersion,
      targetKey: target.key,
    }
  }

  const isLintRunContextCurrent = (scope, runContext) => {
    if (!runContext || runContext.scope !== scope) {
      return false
    }

    const currentSourceVersion =
      scope === 'styles' ? stylesLintSourceVersion : componentLintSourceVersion
    if (runContext.sourceVersion !== currentSourceVersion) {
      return false
    }

    const currentTarget = getCurrentLintTargetIdentity(scope)
    return runContext.targetKey === currentTarget.key
  }

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

  const restoreStatusAfterLintInvalidation = () => {
    if (typeDiagnostics.getLastTypeErrorCount() > 0) {
      setStatus(
        `Rendered (Type errors: ${typeDiagnostics.getLastTypeErrorCount()})`,
        'error',
      )
      return
    }

    if (
      statusNode.textContent.startsWith('Rendered (Lint issues:') ||
      statusNode.textContent.startsWith('Linting component with Biome...') ||
      statusNode.textContent.startsWith('Linting styles with Biome...')
    ) {
      setStatus('Rendered', 'neutral')
    }
  }

  const lintDiagnostics = createLintDiagnosticsController({
    cdnImports,
    importFromCdnWithFallback,
    getComponentSource: getJsxSource,
    getStylesSource: getCssSource,
    getStyleMode,
    setComponentDiagnostics: setStyleDiagnosticsDetails,
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
    const runContext = createLintRunContext('component')

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
        runContext,
        isRunContextCurrent: context => isLintRunContextCurrent('component', context),
      })
      .then(result => {
        if (!result && !isLintRunContextCurrent('component', runContext)) {
          setStyleDiagnosticsDetails({
            headline: 'Source changed. Click Lint to run diagnostics.',
            level: 'muted',
          })

          restoreStatusAfterLintInvalidation()
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
    const runContext = createLintRunContext('styles')

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
        runContext,
        isRunContextCurrent: context => isLintRunContextCurrent('styles', context),
      })
      .then(result => {
        if (!result && !isLintRunContextCurrent('styles', runContext)) {
          setStyleDiagnosticsDetails({
            headline: 'Source changed. Click Lint to run diagnostics.',
            level: 'muted',
          })

          restoreStatusAfterLintInvalidation()
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
    componentLintSourceVersion += 1
    clearComponentLintRecheckTimer()

    activeComponentLintAbortController?.abort()
    activeComponentLintAbortController = null
    lintDiagnostics.cancelComponent()
    setLintButtonLoading({ button: lintComponentButton, isLoading: false })

    componentLintPending = false
    syncLintPendingState()
    setStyleDiagnosticsDetails({
      headline: 'Source changed. Click Lint to run diagnostics.',
      level: 'muted',
    })

    restoreStatusAfterLintInvalidation()
  }

  const markStylesLintDiagnosticsStale = () => {
    stylesLintSourceVersion += 1
    clearStylesLintRecheckTimer()

    activeStylesLintAbortController?.abort()
    activeStylesLintAbortController = null
    lintDiagnostics.cancelStyles()
    setLintButtonLoading({ button: lintStylesButton, isLoading: false })

    stylesLintPending = false
    syncLintPendingState()
    setStyleDiagnosticsDetails({
      headline: 'Source changed. Click Lint to run diagnostics.',
      level: 'muted',
    })

    restoreStatusAfterLintInvalidation()
  }

  const clearComponentLintDiagnosticsState = () => {
    componentLintSourceVersion += 1
    componentLintPending = false
    clearComponentLintRecheckTimer()
    syncLintPendingState()
  }

  const clearStylesLintDiagnosticsState = () => {
    stylesLintSourceVersion += 1
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
