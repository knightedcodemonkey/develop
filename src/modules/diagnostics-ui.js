export const createDiagnosticsUiController = ({
  diagnosticsToggle,
  diagnosticsDrawer,
  diagnosticsComponent,
  diagnosticsStyles,
  statusNode,
  onNavigateDiagnostic = () => {},
}) => {
  let statusLevel = 'neutral'
  let activeTypeDiagnosticsRuns = 0
  let activeLintDiagnosticsRuns = 0
  let typeDiagnosticsPending = false
  let lintDiagnosticsPending = false
  let diagnosticsDrawerOpen = false
  const activeDiagnosticByScope = {
    component: null,
    styles: null,
  }

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

  const getDiagnosticsIssueCount = () => {
    const componentIssues = Array.isArray(diagnosticsByScope.component.lines)
      ? diagnosticsByScope.component.lines.length
      : 0
    const styleIssues = Array.isArray(diagnosticsByScope.styles.lines)
      ? diagnosticsByScope.styles.lines.length
      : 0

    return componentIssues + styleIssues
  }

  const hasDiagnosticsOkResult = () =>
    diagnosticsByScope.component.level === 'ok' ||
    diagnosticsByScope.styles.level === 'ok'

  const hasDiagnosticsErrorResult = () =>
    diagnosticsByScope.component.level === 'error' ||
    diagnosticsByScope.styles.level === 'error'

  const hasActiveDiagnosticsRuns = () =>
    activeTypeDiagnosticsRuns > 0 || activeLintDiagnosticsRuns > 0

  const getDiagnosticsIssueLevel = () => {
    if (typeDiagnosticsPending || lintDiagnosticsPending || hasActiveDiagnosticsRuns()) {
      return 'pending'
    }

    if (getDiagnosticsIssueCount() > 0 || hasDiagnosticsErrorResult()) {
      return 'error'
    }

    if (hasDiagnosticsOkResult()) {
      return 'ok'
    }

    return 'neutral'
  }

  const updateUiIssueIndicators = () => {
    const diagnosticsLevel = getDiagnosticsIssueLevel()
    const hasIssues = getDiagnosticsIssueCount() > 0
    const isDiagnosticsPending = typeDiagnosticsPending || lintDiagnosticsPending

    if (
      !hasIssues &&
      !isDiagnosticsPending &&
      statusLevel === 'error' &&
      (statusNode.textContent.startsWith('Rendered (Type errors:') ||
        statusNode.textContent.startsWith('Rendered (Lint issues:'))
    ) {
      statusNode.textContent = 'Rendered'
      statusLevel = 'neutral'
    }

    statusNode.classList.remove('status--neutral', 'status--pending', 'status--error')
    statusNode.classList.add(`status--${statusLevel}`)

    if (diagnosticsToggle) {
      diagnosticsToggle.classList.remove(
        'diagnostics-toggle--neutral',
        'diagnostics-toggle--ok',
        'diagnostics-toggle--pending',
        'diagnostics-toggle--error',
      )
      diagnosticsToggle.classList.add(`diagnostics-toggle--${diagnosticsLevel}`)
      diagnosticsToggle.setAttribute(
        'aria-busy',
        diagnosticsLevel === 'pending' ? 'true' : 'false',
      )
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
    const parseDiagnosticsLine = entry => {
      if (typeof entry === 'string') {
        const match = entry.match(/^L(\d+)(?::(\d+))?\s+(.*)$/)
        if (match) {
          return {
            line: Number(match[1]),
            column: match[2] ? Number(match[2]) : null,
            message: match[3],
          }
        }

        return {
          line: null,
          column: null,
          message: entry,
        }
      }

      if (entry && typeof entry === 'object') {
        const line = Number.isFinite(entry.line) ? Number(entry.line) : null
        const column = Number.isFinite(entry.column) ? Number(entry.column) : null
        const message =
          typeof entry.message === 'string' && entry.message.length > 0
            ? entry.message
            : typeof entry.text === 'string' && entry.text.length > 0
              ? entry.text
              : 'Unknown diagnostic'

        return {
          line,
          column,
          message,
        }
      }

      return {
        line: null,
        column: null,
        message: 'Unknown diagnostic',
      }
    }

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
      headingNode.className =
        state.level === 'ok'
          ? 'type-diagnostics-heading type-diagnostics-heading--ok'
          : 'type-diagnostics-heading'
      headingNode.textContent = state.headline
      root.append(headingNode)
    }

    if (hasLines) {
      const listNode = document.createElement('ol')
      listNode.className = 'type-diagnostics-list'
      const normalizedLines = state.lines.map(parseDiagnosticsLine)

      if (
        activeDiagnosticByScope[scope] !== null &&
        activeDiagnosticByScope[scope] >= normalizedLines.length
      ) {
        activeDiagnosticByScope[scope] = null
      }

      for (const [index, line] of normalizedLines.entries()) {
        const itemNode = document.createElement('li')
        const locationText = line.line
          ? `L${line.line}${line.column ? `:${line.column}` : ''}`
          : null
        const isJumpTarget =
          Number.isInteger(line.line) &&
          line.line > 0 &&
          typeof onNavigateDiagnostic === 'function'

        if (isJumpTarget) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'diagnostic-line-button'
          button.dataset.diagnosticScope = scope
          button.dataset.diagnosticIndex = String(index)
          button.dataset.diagnosticLine = String(line.line)
          button.dataset.diagnosticColumn = String(line.column ?? 1)

          if (activeDiagnosticByScope[scope] === index) {
            button.classList.add('diagnostic-line-button--active')
            button.setAttribute('aria-current', 'true')
          }

          if (locationText) {
            const locationNode = document.createElement('span')
            locationNode.className = 'diagnostic-line-location'
            locationNode.textContent = locationText
            button.append(locationNode)
          }

          const messageNode = document.createElement('span')
          messageNode.className = 'diagnostic-line-message'
          messageNode.textContent = line.message
          button.append(messageNode)

          button.addEventListener('click', () => {
            activeDiagnosticByScope[scope] = index
            renderDiagnosticsScope(scope)
            onNavigateDiagnostic({
              scope,
              line: line.line,
              column: line.column ?? 1,
            })
          })

          button.addEventListener('keydown', event => {
            const isArrowDown = event.key === 'ArrowDown'
            const isArrowUp = event.key === 'ArrowUp'
            const isEnter = event.key === 'Enter'

            if (isEnter) {
              event.preventDefault()
              button.click()
              return
            }

            if (!isArrowDown && !isArrowUp) {
              return
            }

            event.preventDefault()

            const jumpButtons = [
              ...root.querySelectorAll('.diagnostic-line-button[data-diagnostic-index]'),
            ]
            const currentIndex = jumpButtons.indexOf(button)
            if (currentIndex === -1) {
              return
            }

            const targetIndex = isArrowDown
              ? Math.min(currentIndex + 1, jumpButtons.length - 1)
              : Math.max(currentIndex - 1, 0)

            jumpButtons[targetIndex]?.focus()
          })

          itemNode.append(button)
        } else {
          if (locationText) {
            const locationNode = document.createElement('span')
            locationNode.className = 'diagnostic-line-location'
            locationNode.textContent = locationText
            itemNode.append(locationNode)
            itemNode.append(document.createTextNode(' '))
          }

          const messageNode = document.createElement('span')
          messageNode.className = 'diagnostic-line-message'
          messageNode.textContent = line.message
          itemNode.append(messageNode)
        }

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

    const totalIssues = getDiagnosticsIssueCount()
    diagnosticsToggle.textContent =
      totalIssues > 0 ? `Diagnostics (${totalIssues})` : 'Diagnostics'
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
    activeDiagnosticByScope[scope] = null

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

  const setActiveLintDiagnosticsRuns = nextValue => {
    activeLintDiagnosticsRuns = Math.max(0, nextValue)
    updateUiIssueIndicators()
  }

  const incrementLintDiagnosticsRuns = () => {
    setActiveLintDiagnosticsRuns(activeLintDiagnosticsRuns + 1)
  }

  const decrementLintDiagnosticsRuns = () => {
    setActiveLintDiagnosticsRuns(activeLintDiagnosticsRuns - 1)
  }

  const setTypeDiagnosticsPending = isPending => {
    typeDiagnosticsPending = Boolean(isPending)
    updateUiIssueIndicators()
  }

  const setLintDiagnosticsPending = isPending => {
    lintDiagnosticsPending = Boolean(isPending)
    updateUiIssueIndicators()
  }

  return {
    clearAllDiagnostics,
    clearDiagnosticsScope,
    decrementLintDiagnosticsRuns,
    decrementTypeDiagnosticsRuns,
    getActiveLintDiagnosticsRuns: () => activeLintDiagnosticsRuns,
    incrementTypeDiagnosticsRuns,
    incrementLintDiagnosticsRuns,
    setLintDiagnosticsPending,
    setTypeDiagnosticsPending,
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
