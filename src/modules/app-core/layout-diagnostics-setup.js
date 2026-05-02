const createLayoutDiagnosticsSetup = ({
  compactAiControlsUi,
  appGrid,
  previewPanel,
  panelCollapseButtons,
  editorKinds,
  editorPanelsByKind,
  editorToolsButtons,
  createDiagnosticsUiController,
  diagnosticsToggle,
  diagnosticsDrawer,
  diagnosticsComponent,
  diagnosticsStyles,
  statusNode,
  getJsxCodeEditor,
  getCssCodeEditor,
  jsxEditor,
  cssEditor,
}) => {
  const getPanelCollapseAxis = panelName => {
    if (panelName !== 'preview') {
      return 'vertical'
    }

    if (compactAiControlsUi.isCompactViewport()) {
      return 'vertical'
    }

    return 'horizontal'
  }

  const getPanelCollapseDirection = panelName => {
    const axis = getPanelCollapseAxis(panelName)
    if (axis !== 'horizontal') {
      return 'none'
    }

    if (panelName === 'preview') {
      return 'right'
    }

    return 'right'
  }

  const panelCollapseState = {
    preview: false,
  }

  const panelToolsState = {
    component: false,
    styles: false,
  }

  const applyEditorToolsVisibility = () => {
    for (const editorKind of editorKinds) {
      editorPanelsByKind[editorKind]?.classList.toggle(
        'panel--tools-hidden',
        !panelToolsState[editorKind],
      )
    }

    for (const button of editorToolsButtons) {
      const panelName = button.dataset.editorToolsToggle
      if (!panelName || !Object.hasOwn(panelToolsState, panelName)) {
        continue
      }

      const isVisible = panelToolsState[panelName]
      button.setAttribute('aria-pressed', isVisible ? 'true' : 'false')
      button.setAttribute(
        'aria-label',
        `${isVisible ? 'Hide' : 'Show'} ${panelName} tools`,
      )
      button.setAttribute('title', `${isVisible ? 'Hide' : 'Show'} ${panelName} tools`)
    }
  }

  const syncPanelCollapseButtons = () => {
    for (const button of panelCollapseButtons) {
      const panelName = button.dataset.panelCollapse
      if (!panelName || !Object.hasOwn(panelCollapseState, panelName)) {
        continue
      }

      const axis = getPanelCollapseAxis(panelName)
      const direction = getPanelCollapseDirection(panelName)
      const isCollapsed = panelCollapseState[panelName] === true
      const panelTitle = `${panelName.charAt(0).toUpperCase()}${panelName.slice(1)}`

      button.dataset.collapseAxis = axis
      button.dataset.collapseDirection = direction
      button.dataset.collapsed = isCollapsed ? 'true' : 'false'
      button.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true')
      button.disabled = false
      button.setAttribute('aria-disabled', 'false')
      button.setAttribute(
        'aria-label',
        `${isCollapsed ? 'Expand' : 'Collapse'} ${panelTitle.toLowerCase()} panel`,
      )
      button.setAttribute(
        'title',
        `${isCollapsed ? 'Expand' : 'Collapse'} ${panelTitle.toLowerCase()} panel`,
      )
    }
  }

  const applyPanelCollapseState = () => {
    const previewAxis = getPanelCollapseAxis('preview')

    if (previewPanel) {
      const isCollapsed = panelCollapseState.preview
      previewPanel.classList.toggle(
        'panel--collapsed-vertical',
        isCollapsed && previewAxis === 'vertical',
      )
      previewPanel.classList.toggle(
        'panel--collapsed-horizontal',
        isCollapsed && previewAxis === 'horizontal',
      )
    }

    appGrid.classList.toggle(
      'app-grid--preview-collapsed-horizontal',
      panelCollapseState.preview && previewAxis === 'horizontal',
    )
    appGrid.classList.toggle('app-grid--preview-collapsed', panelCollapseState.preview)

    syncPanelCollapseButtons()
  }

  const togglePanelCollapse = panelName => {
    if (panelName !== 'preview') {
      return
    }

    panelCollapseState[panelName] = !panelCollapseState[panelName]
    applyPanelCollapseState()
  }

  const toTextareaOffset = (source, line, column = 1) => {
    if (typeof source !== 'string' || source.length === 0) {
      return 0
    }

    const targetLine = Number.isFinite(line) ? Math.max(1, Number(line)) : 1
    const targetColumn = Number.isFinite(column) ? Math.max(1, Number(column)) : 1

    let currentLine = 1
    let lineStartOffset = 0

    for (let index = 0; index < source.length; index += 1) {
      if (currentLine === targetLine) {
        lineStartOffset = index
        break
      }

      if (source[index] === '\n') {
        currentLine += 1
        lineStartOffset = index + 1
      }
    }

    const nextNewlineOffset = source.indexOf('\n', lineStartOffset)
    const lineEndOffset = nextNewlineOffset === -1 ? source.length : nextNewlineOffset
    return Math.min(lineStartOffset + targetColumn - 1, lineEndOffset)
  }

  const navigateToComponentDiagnostic = ({ line, column }) => {
    const jsxCodeEditor = getJsxCodeEditor()
    if (jsxCodeEditor && typeof jsxCodeEditor.revealPosition === 'function') {
      jsxCodeEditor.revealPosition({ line, column })
      return
    }

    if (!(jsxEditor instanceof HTMLTextAreaElement)) {
      return
    }

    const source = jsxEditor.value
    const offset = toTextareaOffset(source, line, column)
    jsxEditor.focus()
    jsxEditor.setSelectionRange(offset, offset)
  }

  const navigateToStylesDiagnostic = ({ line, column }) => {
    const cssCodeEditor = getCssCodeEditor()
    if (cssCodeEditor && typeof cssCodeEditor.revealPosition === 'function') {
      cssCodeEditor.revealPosition({ line, column })
      return
    }

    if (!(cssEditor instanceof HTMLTextAreaElement)) {
      return
    }

    const source = cssEditor.value
    const offset = toTextareaOffset(source, line, column)
    cssEditor.focus()
    cssEditor.setSelectionRange(offset, offset)
  }

  const diagnosticsUi = createDiagnosticsUiController({
    diagnosticsToggle,
    diagnosticsDrawer,
    diagnosticsComponent,
    diagnosticsStyles,
    statusNode,
    onNavigateDiagnostic: diagnostic => {
      if (diagnostic?.scope === 'component') {
        navigateToComponentDiagnostic({
          line: diagnostic.line,
          column: diagnostic.column,
        })
        return
      }

      if (diagnostic?.scope === 'styles') {
        navigateToStylesDiagnostic({
          line: diagnostic.line,
          column: diagnostic.column,
        })
      }
    },
  })

  return {
    applyEditorToolsVisibility,
    applyPanelCollapseState,
    diagnosticsUi,
    panelToolsState,
    togglePanelCollapse,
  }
}

export { createLayoutDiagnosticsSetup }
