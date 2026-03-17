export const createDiagnosticsUiController = ({
  diagnosticsToggle,
  diagnosticsDrawer,
  diagnosticsComponent,
  diagnosticsStyles,
  statusNode,
}) => {
  let statusLevel = 'neutral'
  let activeTypeDiagnosticsRuns = 0
  let diagnosticsDrawerOpen = false

  const diagnosticsByScope = {
    component: {
      headline: '',
      lines: [],
      level: 'muted',
    },
    styles: {
      headline: '',
      lines: [],
      level: 'muted',
    },
  }

  const getDiagnosticsScopeNode = scope => {
    if (scope === 'component') {
      return diagnosticsComponent
    }

    if (scope === 'styles') {
      return diagnosticsStyles
    }

    return null
  }

  const getDiagnosticsErrorCount = () => {
    const componentErrors =
      diagnosticsByScope.component.level === 'error'
        ? diagnosticsByScope.component.lines.length
        : 0
    const styleErrors =
      diagnosticsByScope.styles.level === 'error'
        ? diagnosticsByScope.styles.lines.length
        : 0
    return componentErrors + styleErrors
  }

  const getDiagnosticsIssueLevel = () => {
    if (getDiagnosticsErrorCount() > 0) {
      return 'error'
    }

    if (activeTypeDiagnosticsRuns > 0) {
      return 'pending'
    }

    return 'neutral'
  }

  const updateUiIssueIndicators = () => {
    const diagnosticsLevel = getDiagnosticsIssueLevel()

    statusNode.classList.remove('status--neutral', 'status--pending', 'status--error')
    statusNode.classList.add(`status--${statusLevel}`)

    if (diagnosticsToggle) {
      diagnosticsToggle.classList.remove(
        'diagnostics-toggle--neutral',
        'diagnostics-toggle--pending',
        'diagnostics-toggle--error',
      )
      diagnosticsToggle.classList.add(`diagnostics-toggle--${diagnosticsLevel}`)
    }
  }

  const setStatus = (text, level) => {
    statusNode.textContent = text
    statusLevel = level ?? 'neutral'
    updateUiIssueIndicators()
  }

  const renderDiagnosticsScope = scope => {
    const root = getDiagnosticsScopeNode(scope)
    const state = diagnosticsByScope[scope]
    if (!root || !state) {
      return
    }

    root.classList.remove(
      'panel-footer--muted',
      'panel-footer--ok',
      'panel-footer--error',
    )
    root.replaceChildren()

    const hasHeadline = typeof state.headline === 'string' && state.headline.length > 0
    const hasLines = Array.isArray(state.lines) && state.lines.length > 0

    if (!hasHeadline && !hasLines) {
      const emptyNode = document.createElement('div')
      emptyNode.className = 'diagnostics-empty'
      emptyNode.textContent = 'No diagnostics yet.'
      root.append(emptyNode)
      root.classList.add('panel-footer--muted')
      return
    }

    if (hasHeadline) {
      const headingNode = document.createElement('div')
      headingNode.className = 'type-diagnostics-heading'
      headingNode.textContent = state.headline
      root.append(headingNode)
    }

    if (hasLines) {
      const listNode = document.createElement('ol')
      listNode.className = 'type-diagnostics-list'
      for (const line of state.lines) {
        const itemNode = document.createElement('li')
        itemNode.textContent = line
        listNode.append(itemNode)
      }
      root.append(listNode)
    }

    if (state.level === 'ok') {
      root.classList.add('panel-footer--ok')
      return
    }

    if (state.level === 'error') {
      root.classList.add('panel-footer--error')
      return
    }

    root.classList.add('panel-footer--muted')
  }

  const updateDiagnosticsToggleLabel = () => {
    if (!diagnosticsToggle) {
      return
    }

    const totalErrors = getDiagnosticsErrorCount()
    diagnosticsToggle.textContent =
      totalErrors > 0 ? `Diagnostics (${totalErrors})` : 'Diagnostics'
  }

  const setDiagnosticsDrawerOpen = isOpen => {
    diagnosticsDrawerOpen = Boolean(isOpen)

    if (diagnosticsDrawer) {
      diagnosticsDrawer.hidden = !diagnosticsDrawerOpen
    }

    if (diagnosticsToggle) {
      diagnosticsToggle.setAttribute(
        'aria-expanded',
        diagnosticsDrawerOpen ? 'true' : 'false',
      )
    }
  }

  const setDiagnosticsScope = (scope, { headline = '', lines = [], level = 'muted' }) => {
    if (!diagnosticsByScope[scope]) {
      return
    }

    diagnosticsByScope[scope] = {
      headline,
      lines,
      level,
    }

    renderDiagnosticsScope(scope)
    updateDiagnosticsToggleLabel()
    updateUiIssueIndicators()
  }

  const clearDiagnosticsScope = scope => {
    setDiagnosticsScope(scope, { headline: '', lines: [], level: 'muted' })
  }

  const clearAllDiagnostics = () => {
    clearDiagnosticsScope('component')
    clearDiagnosticsScope('styles')
  }

  const setTypeDiagnosticsDetails = ({ headline, lines = [], level = 'muted' }) => {
    setDiagnosticsScope('component', { headline, lines, level })
  }

  const setStyleDiagnosticsDetails = ({ headline, lines = [], level = 'muted' }) => {
    setDiagnosticsScope('styles', { headline, lines, level })
  }

  const setActiveTypeDiagnosticsRuns = nextValue => {
    activeTypeDiagnosticsRuns = Math.max(0, nextValue)
    updateUiIssueIndicators()
  }

  const incrementTypeDiagnosticsRuns = () => {
    setActiveTypeDiagnosticsRuns(activeTypeDiagnosticsRuns + 1)
  }

  const decrementTypeDiagnosticsRuns = () => {
    setActiveTypeDiagnosticsRuns(activeTypeDiagnosticsRuns - 1)
  }

  return {
    clearAllDiagnostics,
    clearDiagnosticsScope,
    decrementTypeDiagnosticsRuns,
    incrementTypeDiagnosticsRuns,
    getActiveTypeDiagnosticsRuns: () => activeTypeDiagnosticsRuns,
    getDiagnosticsDrawerOpen: () => diagnosticsDrawerOpen,
    renderDiagnosticsScope,
    setDiagnosticsDrawerOpen,
    setStatus,
    setStyleDiagnosticsDetails,
    setTypeDiagnosticsDetails,
    updateDiagnosticsToggleLabel,
    updateUiIssueIndicators,
  }
}
