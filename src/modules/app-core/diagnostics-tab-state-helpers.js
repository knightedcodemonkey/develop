const createDiagnosticsTabStateHelpers = ({
  getActiveWorkspaceTab,
  getLoadedComponentWorkspaceTab,
  getLoadedStylesWorkspaceTab,
  getTabKind,
  toNonEmptyWorkspaceText,
  diagnosticsComponentSection,
  diagnosticsStylesSection,
  diagnosticsComponentHeading,
  diagnosticsStylesHeading,
  diagnosticsClearComponent,
  diagnosticsClearStyles,
  diagnosticsClearAll,
  clearAllDiagnostics,
  setTypeDiagnosticsPending,
  setLintDiagnosticsPending,
  statusNode,
  setStatus,
  getDiagnosticsFlowController,
}) => {
  const syncDiagnosticsDrawerLayout = () => {
    const activeTab = getActiveWorkspaceTab()
    const isStylesTab = getTabKind(activeTab) === 'styles'

    if (diagnosticsComponentSection instanceof HTMLElement) {
      diagnosticsComponentSection.hidden = isStylesTab
    }

    if (diagnosticsStylesSection instanceof HTMLElement) {
      diagnosticsStylesSection.hidden = false
    }

    if (diagnosticsComponentHeading instanceof HTMLElement) {
      diagnosticsComponentHeading.textContent = 'Typecheck'
    }

    if (diagnosticsStylesHeading instanceof HTMLElement) {
      diagnosticsStylesHeading.textContent = 'Lint'
    }

    if (diagnosticsClearComponent instanceof HTMLButtonElement) {
      diagnosticsClearComponent.hidden = isStylesTab
      diagnosticsClearComponent.textContent = 'Reset types'
    }

    if (diagnosticsClearStyles instanceof HTMLButtonElement) {
      diagnosticsClearStyles.hidden = false
      diagnosticsClearStyles.textContent = 'Reset lint'
    }

    if (diagnosticsClearAll instanceof HTMLButtonElement) {
      diagnosticsClearAll.hidden = isStylesTab
      diagnosticsClearAll.textContent = 'Reset all'
    }
  }

  const clearDiagnosticsOnTabSwitch = () => {
    clearAllDiagnostics()
    setTypeDiagnosticsPending(false)
    setLintDiagnosticsPending(false)

    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered', 'neutral')
    }

    if (statusNode.textContent.startsWith('Rendered (Lint issues:')) {
      setStatus('Rendered', 'neutral')
    }

    const diagnosticsFlowController = getDiagnosticsFlowController()
    if (diagnosticsFlowController) {
      diagnosticsFlowController.typeDiagnostics.clearTypeDiagnosticsState()
      diagnosticsFlowController.clearComponentLintDiagnosticsState()
      diagnosticsFlowController.clearStylesLintDiagnosticsState()
    }
  }

  const getComponentLintTarget = () => {
    const activeTab = getActiveWorkspaceTab()
    const tab =
      activeTab && getTabKind(activeTab) === 'component'
        ? activeTab
        : getLoadedComponentWorkspaceTab()
    if (!tab) {
      return null
    }

    return {
      tabId: toNonEmptyWorkspaceText(tab.id),
      path: toNonEmptyWorkspaceText(tab.path),
      language: toNonEmptyWorkspaceText(tab.language),
    }
  }

  const getStylesLintTarget = () => {
    const activeTab = getActiveWorkspaceTab()
    const tab =
      activeTab && getTabKind(activeTab) === 'styles'
        ? activeTab
        : getLoadedStylesWorkspaceTab()
    if (!tab) {
      return null
    }

    return {
      tabId: toNonEmptyWorkspaceText(tab.id),
      path: toNonEmptyWorkspaceText(tab.path),
      language: toNonEmptyWorkspaceText(tab.language),
    }
  }

  return {
    clearDiagnosticsOnTabSwitch,
    getComponentLintTarget,
    getStylesLintTarget,
    syncDiagnosticsDrawerLayout,
  }
}

export { createDiagnosticsTabStateHelpers }
