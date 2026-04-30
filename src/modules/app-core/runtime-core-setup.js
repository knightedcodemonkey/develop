const createRuntimeCoreSetup = ({
  createDiagnosticsFlowController,
  createRenderRuntimeController,
  diagnosticsFlowOptions,
  renderRuntimeOptions,
  clearConfirmDialog,
  clearConfirmTitle,
  clearConfirmCopy,
  clearConfirmButton,
  setPendingClearAction,
  normalizeRenderMode,
  normalizeStyleMode,
  persistRenderMode,
  resetDiagnosticsFlow,
  maybeRender,
  flushWorkspaceSave,
  renderMode,
  styleMode,
  getCssCodeEditor,
  setSuppressEditorChangeSideEffects,
  getStyleEditorLanguage,
  getActiveWorkspaceTab,
  isStyleWorkspaceTab,
  workspaceTabsState,
  queueWorkspaceSave,
}) => {
  const setCdnLoading = isLoading => {
    const cdnLoading = document.getElementById('cdn-loading')
    if (!cdnLoading) return
    cdnLoading.hidden = !isLoading
  }

  const diagnosticsFlowController =
    createDiagnosticsFlowController(diagnosticsFlowOptions)

  const setRenderedStatus = () => diagnosticsFlowController.setRenderedStatus()

  const renderRuntime = createRenderRuntimeController({
    ...renderRuntimeOptions,
    setRenderedStatus,
    setCdnLoading,
  })

  const confirmAction = ({ title, copy, confirmButtonText = 'Clear', onConfirm }) => {
    const toConfirmText = value => (typeof value === 'string' ? value.trim() : '')
    if (
      !(clearConfirmDialog instanceof HTMLDialogElement) ||
      typeof clearConfirmDialog.showModal !== 'function'
    ) {
      return
    }

    if (clearConfirmDialog.open) {
      return
    }

    if (clearConfirmTitle) {
      clearConfirmTitle.textContent = title
    }

    if (clearConfirmCopy instanceof HTMLUListElement) {
      const lines = toConfirmText(copy)
        .split('\n')
        .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean)

      clearConfirmCopy.replaceChildren()
      const items = lines.length > 0 ? lines : [toConfirmText(copy)]

      for (const line of items) {
        if (!line) {
          continue
        }

        const listItem = document.createElement('li')
        listItem.textContent = line
        clearConfirmCopy.append(listItem)
      }
    } else if (clearConfirmCopy) {
      clearConfirmCopy.textContent = copy
    }

    if (clearConfirmButton instanceof HTMLButtonElement) {
      clearConfirmButton.textContent = confirmButtonText
      clearConfirmButton.removeAttribute('aria-label')
    }

    setPendingClearAction(onConfirm)
    clearConfirmDialog.showModal()
  }

  const applyRenderMode = ({
    mode,
    fromActivePrContext: _fromActivePrContext = false,
  }) => {
    const nextMode = normalizeRenderMode(mode)

    if (renderMode.value !== nextMode) {
      renderMode.value = nextMode
    }

    persistRenderMode(nextMode)
    resetDiagnosticsFlow()

    maybeRender()
    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
  }

  const applyStyleMode = ({ mode }) => {
    const nextMode = normalizeStyleMode(mode)

    if (styleMode.value !== nextMode) {
      styleMode.value = nextMode
    }

    resetDiagnosticsFlow()

    const cssCodeEditor = getCssCodeEditor()
    if (cssCodeEditor) {
      setSuppressEditorChangeSideEffects(true)
      try {
        cssCodeEditor.setLanguage(getStyleEditorLanguage(nextMode))
      } finally {
        setSuppressEditorChangeSideEffects(false)
      }
    }

    const activeTab = getActiveWorkspaceTab()
    if (activeTab && isStyleWorkspaceTab(activeTab)) {
      const nextLanguage =
        nextMode === 'less'
          ? 'less'
          : nextMode === 'sass'
            ? 'sass'
            : nextMode === 'module'
              ? 'module'
              : 'css'

      if (activeTab.language !== nextLanguage) {
        workspaceTabsState.upsertTab(
          {
            ...activeTab,
            language: nextLanguage,
            lastModified: Date.now(),
            isActive: true,
          },
          { emitReason: 'styleModeChange' },
        )
        queueWorkspaceSave()
      }
    }

    maybeRender()
    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
  }

  return {
    applyRenderMode,
    applyStyleMode,
    confirmAction,
    diagnosticsFlowController,
    renderRuntime,
    setCdnLoading,
    setRenderedStatus,
  }
}

export { createRuntimeCoreSetup }
