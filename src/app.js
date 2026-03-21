import {
  cdnImports,
  getTypePackageFileUrls,
  getTypeScriptLibUrls,
  importFromCdnWithFallback,
} from './modules/cdn.js'
import { createCodeMirrorEditor } from './modules/editor-codemirror.js'
import { defaultCss, defaultJsx, defaultReactJsx } from './modules/defaults.js'
import { createDiagnosticsUiController } from './modules/diagnostics-ui.js'
import { createLayoutThemeController } from './modules/layout-theme.js'
import { createLintDiagnosticsController } from './modules/lint-diagnostics.js'
import { createPreviewBackgroundController } from './modules/preview-background.js'
import { createRenderRuntimeController } from './modules/render-runtime.js'
import { createTypeDiagnosticsController } from './modules/type-diagnostics.js'

const statusNode = document.getElementById('status')
const appGrid = document.querySelector('.app-grid')
const appGridLayoutButtons = document.querySelectorAll('[data-app-grid-layout]')
const appThemeButtons = document.querySelectorAll('[data-app-theme]')
const editorToolsButtons = document.querySelectorAll('[data-editor-tools-toggle]')
const panelCollapseButtons = document.querySelectorAll('[data-panel-collapse]')
const componentPanel = document.getElementById('component-panel')
const stylesPanel = document.getElementById('styles-panel')
const previewPanel = document.getElementById('preview-panel')
const renderMode = document.getElementById('render-mode')
const autoRenderToggle = document.getElementById('auto-render')
const typecheckButton = document.getElementById('typecheck-button')
const lintComponentButton = document.getElementById('lint-component-button')
const lintStylesButton = document.getElementById('lint-styles-button')
const renderButton = document.getElementById('render-button')
const copyComponentButton = document.getElementById('copy-component')
const clearComponentButton = document.getElementById('clear-component')
const styleMode = document.getElementById('style-mode')
const copyStylesButton = document.getElementById('copy-styles')
const clearStylesButton = document.getElementById('clear-styles')
const shadowToggle = document.getElementById('shadow-toggle')
const jsxEditor = document.getElementById('jsx-editor')
const cssEditor = document.getElementById('css-editor')
const diagnosticsToggle = document.getElementById('diagnostics-toggle')
const diagnosticsDrawer = document.getElementById('diagnostics-drawer')
const diagnosticsClose = document.getElementById('diagnostics-close')
const diagnosticsClearComponent = document.getElementById('diagnostics-clear-component')
const diagnosticsClearStyles = document.getElementById('diagnostics-clear-styles')
const diagnosticsClearAll = document.getElementById('diagnostics-clear-all')
const diagnosticsComponent = document.getElementById('diagnostics-component')
const diagnosticsStyles = document.getElementById('diagnostics-styles')
const cdnLoading = document.getElementById('cdn-loading')
const previewBgColorInput = document.getElementById('preview-bg-color')
const clearConfirmDialog = document.getElementById('clear-confirm-dialog')
const clearConfirmTitle = document.getElementById('clear-confirm-title')
const clearConfirmCopy = document.getElementById('clear-confirm-copy')

jsxEditor.value = defaultJsx
cssEditor.value = defaultCss

let previewHost = document.getElementById('preview-host')
let jsxCodeEditor = null
let cssCodeEditor = null
let getJsxSource = () => jsxEditor.value
let getCssSource = () => cssEditor.value
let renderRuntime = null
let pendingClearAction = null
let suppressEditorChangeSideEffects = false
let hasAppliedReactModeDefault = false
const clipboardSupported = Boolean(navigator.clipboard?.writeText)

const previewBackground = createPreviewBackgroundController({
  previewBgColorInput,
  getPreviewHost: () => previewHost,
})

const layoutTheme = createLayoutThemeController({
  appGrid,
  appGridLayoutButtons,
  appThemeButtons,
  syncPreviewBackgroundPickerFromTheme: () =>
    previewBackground.syncPreviewBackgroundPickerFromTheme(),
})

const { applyAppGridLayout, applyTheme, getInitialAppGridLayout, getInitialTheme } =
  layoutTheme

const compactViewportMediaQuery = window.matchMedia('(max-width: 900px)')

const getCurrentLayout = () => {
  if (appGrid.classList.contains('app-grid--preview-right')) {
    return 'preview-right'
  }

  if (appGrid.classList.contains('app-grid--preview-left')) {
    return 'preview-left'
  }

  return 'default'
}

const isCompactViewport = () => compactViewportMediaQuery.matches

const getPanelCollapseAxis = panelName => {
  if (isCompactViewport()) {
    return 'vertical'
  }

  const layout = getCurrentLayout()

  if (panelName === 'preview') {
    return layout === 'default' ? 'vertical' : 'horizontal'
  }

  if (panelName === 'component' || panelName === 'styles') {
    return layout === 'default' ? 'horizontal' : 'vertical'
  }

  return 'vertical'
}

const getPanelCollapseDirection = panelName => {
  const axis = getPanelCollapseAxis(panelName)
  if (axis !== 'horizontal') {
    return 'none'
  }

  const layout = getCurrentLayout()

  if (panelName === 'preview') {
    return layout === 'preview-left' ? 'left' : 'right'
  }

  if (panelName === 'component') {
    return 'left'
  }

  if (panelName === 'styles') {
    return 'right'
  }

  return 'right'
}

const panelCollapseState = {
  component: false,
  styles: false,
  preview: false,
}

const panelToolsState = {
  component: false,
  styles: false,
}

const applyEditorToolsVisibility = () => {
  componentPanel?.classList.toggle('panel--tools-hidden', !panelToolsState.component)
  stylesPanel?.classList.toggle('panel--tools-hidden', !panelToolsState.styles)

  for (const button of editorToolsButtons) {
    const panelName = button.dataset.editorToolsToggle
    if (!panelName || !Object.hasOwn(panelToolsState, panelName)) {
      continue
    }

    const isVisible = panelToolsState[panelName]
    button.setAttribute('aria-pressed', isVisible ? 'true' : 'false')
    button.setAttribute('aria-label', `${isVisible ? 'Hide' : 'Show'} ${panelName} tools`)
    button.setAttribute('title', `${isVisible ? 'Hide' : 'Show'} ${panelName} tools`)
  }
}

const normalizePanelCollapseState = () => {
  const collapsedPanels = Object.entries(panelCollapseState)
    .filter(([, isCollapsed]) => isCollapsed)
    .map(([panelName]) => panelName)

  if (collapsedPanels.length === Object.keys(panelCollapseState).length) {
    panelCollapseState.preview = false
  }
}

const syncPanelCollapseButtons = () => {
  const collapsedCount = Object.values(panelCollapseState).filter(Boolean).length

  for (const button of panelCollapseButtons) {
    const panelName = button.dataset.panelCollapse
    if (!panelName || !Object.hasOwn(panelCollapseState, panelName)) {
      continue
    }

    const axis = getPanelCollapseAxis(panelName)
    const direction = getPanelCollapseDirection(panelName)
    const isCollapsed = panelCollapseState[panelName] === true
    const panelTitle = `${panelName.charAt(0).toUpperCase()}${panelName.slice(1)}`
    const canCollapse = isCollapsed || collapsedCount < 2

    button.dataset.collapseAxis = axis
    button.dataset.collapseDirection = direction
    button.dataset.collapsed = isCollapsed ? 'true' : 'false'
    button.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true')
    button.disabled = !canCollapse
    button.setAttribute('aria-disabled', canCollapse ? 'false' : 'true')
    button.setAttribute(
      'aria-label',
      `${isCollapsed ? 'Expand' : 'Collapse'} ${panelTitle.toLowerCase()} panel`,
    )
    button.setAttribute(
      'title',
      canCollapse
        ? `${isCollapsed ? 'Expand' : 'Collapse'} ${panelTitle.toLowerCase()} panel`
        : 'At least one panel must remain expanded.',
    )
  }
}

const applyPanelCollapseState = () => {
  normalizePanelCollapseState()

  const previewAxis = getPanelCollapseAxis('preview')
  const componentAxis = getPanelCollapseAxis('component')
  const stylesAxis = getPanelCollapseAxis('styles')

  if (componentPanel) {
    const isCollapsed = panelCollapseState.component
    componentPanel.classList.toggle(
      'panel--collapsed-vertical',
      isCollapsed && componentAxis === 'vertical',
    )
    componentPanel.classList.toggle(
      'panel--collapsed-horizontal',
      isCollapsed && componentAxis === 'horizontal',
    )
  }

  if (stylesPanel) {
    const isCollapsed = panelCollapseState.styles
    stylesPanel.classList.toggle(
      'panel--collapsed-vertical',
      isCollapsed && stylesAxis === 'vertical',
    )
    stylesPanel.classList.toggle(
      'panel--collapsed-horizontal',
      isCollapsed && stylesAxis === 'horizontal',
    )
  }

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
  appGrid.classList.toggle('app-grid--component-collapsed', panelCollapseState.component)
  appGrid.classList.toggle('app-grid--styles-collapsed', panelCollapseState.styles)
  appGrid.classList.toggle(
    'app-grid--component-collapsed-horizontal',
    panelCollapseState.component && componentAxis === 'horizontal',
  )
  appGrid.classList.toggle(
    'app-grid--styles-collapsed-horizontal',
    panelCollapseState.styles && stylesAxis === 'horizontal',
  )

  syncPanelCollapseButtons()
}

const togglePanelCollapse = panelName => {
  if (!Object.hasOwn(panelCollapseState, panelName)) {
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

const {
  clearAllDiagnostics,
  clearDiagnosticsScope,
  decrementLintDiagnosticsRuns,
  decrementTypeDiagnosticsRuns,
  getActiveTypeDiagnosticsRuns,
  getDiagnosticsDrawerOpen,
  incrementLintDiagnosticsRuns,
  incrementTypeDiagnosticsRuns,
  renderDiagnosticsScope,
  setDiagnosticsDrawerOpen,
  setLintDiagnosticsPending,
  setTypeDiagnosticsPending,
  setStatus,
  setStyleDiagnosticsDetails,
  setTypeDiagnosticsDetails,
  updateDiagnosticsToggleLabel,
  updateUiIssueIndicators,
} = diagnosticsUi

const getStyleEditorLanguage = mode => {
  if (mode === 'less') return 'less'
  if (mode === 'sass') return 'sass'
  return 'css'
}

const createEditorHost = textarea => {
  const host = document.createElement('div')
  host.className = 'editor-host'
  textarea.before(host)
  return host
}

const initializeCodeEditors = async () => {
  const jsxHost = createEditorHost(jsxEditor)
  const cssHost = createEditorHost(cssEditor)

  try {
    const [nextJsxEditor, nextCssEditor] = await Promise.all([
      createCodeMirrorEditor({
        parent: jsxHost,
        value: defaultJsx,
        language: 'javascript-jsx',
        onChange: () => {
          if (suppressEditorChangeSideEffects) {
            return
          }
          maybeRender()
          markTypeDiagnosticsStale()
          markComponentLintDiagnosticsStale()
        },
      }),
      createCodeMirrorEditor({
        parent: cssHost,
        value: defaultCss,
        language: getStyleEditorLanguage(styleMode.value),
        onChange: () => {
          if (suppressEditorChangeSideEffects) {
            return
          }
          maybeRender()
          markStylesLintDiagnosticsStale()
        },
      }),
    ])

    jsxCodeEditor = nextJsxEditor
    cssCodeEditor = nextCssEditor
    getJsxSource = () => jsxCodeEditor.getValue()
    getCssSource = () => cssCodeEditor.getValue()

    jsxEditor.classList.add('source-textarea--hidden')
    cssEditor.classList.add('source-textarea--hidden')
  } catch (error) {
    jsxHost.remove()
    cssHost.remove()
    const message = error instanceof Error ? error.message : String(error)
    setStatus(`Editor fallback: ${message}`, 'neutral')
  }
}

const setTypecheckButtonLoading = isLoading => {
  if (!typecheckButton) {
    return
  }

  typecheckButton.classList.toggle('render-button--loading', isLoading)
  typecheckButton.setAttribute('aria-busy', isLoading ? 'true' : 'false')
  typecheckButton.disabled = isLoading
}

const setLintButtonLoading = ({ button, isLoading }) => {
  if (!(button instanceof HTMLButtonElement)) {
    return
  }

  button.classList.toggle('render-button--loading', isLoading)
  button.setAttribute('aria-busy', isLoading ? 'true' : 'false')
  button.disabled = isLoading
}

const setCdnLoading = isLoading => {
  if (!cdnLoading) return
  cdnLoading.hidden = !isLoading
}

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

const typeDiagnostics = createTypeDiagnosticsController({
  cdnImports,
  importFromCdnWithFallback,
  getTypeScriptLibUrls,
  getTypePackageFileUrls,
  getJsxSource: () => getJsxSource(),
  getRenderMode: () => renderMode.value,
  setTypecheckButtonLoading,
  setTypeDiagnosticsDetails,
  setTypeDiagnosticsPending,
  setStatus,
  setRenderedStatus,
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

const lintDiagnostics = createLintDiagnosticsController({
  cdnImports,
  importFromCdnWithFallback,
  getComponentSource: () => getJsxSource(),
  getStylesSource: () => getCssSource(),
  getStyleMode: () => styleMode.value,
  setComponentDiagnostics: setTypeDiagnosticsDetails,
  setStyleDiagnostics: setStyleDiagnosticsDetails,
  setStatus,
  onIssuesDetected: ({ issueCount }) => {
    if (issueCount > 0) {
      setDiagnosticsDrawerOpen(true)
    }
  },
})

let activeComponentLintAbortController = null
let activeStylesLintAbortController = null
let lastComponentLintIssueCount = 0
let lastStylesLintIssueCount = 0
let scheduledComponentLintRecheck = null
let scheduledStylesLintRecheck = null
let componentLintPending = false
let stylesLintPending = false

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

const runComponentLint = async ({ userInitiated = false } = {}) => {
  activeComponentLintAbortController?.abort()
  const controller = new AbortController()
  activeComponentLintAbortController = controller
  componentLintPending = false
  syncLintPendingState()
  incrementLintDiagnosticsRuns()

  setLintButtonLoading({ button: lintComponentButton, isLoading: true })

  try {
    const result = await lintDiagnostics.lintComponent({
      signal: controller.signal,
      userInitiated,
    })
    if (result) {
      lastComponentLintIssueCount = result.issueCount
    }
  } finally {
    decrementLintDiagnosticsRuns()
    if (activeComponentLintAbortController === controller) {
      activeComponentLintAbortController = null
      setLintButtonLoading({ button: lintComponentButton, isLoading: false })
    }
  }
}

const runStylesLint = async ({ userInitiated = false } = {}) => {
  activeStylesLintAbortController?.abort()
  const controller = new AbortController()
  activeStylesLintAbortController = controller
  stylesLintPending = false
  syncLintPendingState()
  incrementLintDiagnosticsRuns()

  setLintButtonLoading({ button: lintStylesButton, isLoading: true })

  try {
    const result = await lintDiagnostics.lintStyles({
      signal: controller.signal,
      userInitiated,
    })
    if (result) {
      lastStylesLintIssueCount = result.issueCount
    }
  } finally {
    decrementLintDiagnosticsRuns()
    if (activeStylesLintAbortController === controller) {
      activeStylesLintAbortController = null
      setLintButtonLoading({ button: lintStylesButton, isLoading: false })
    }
  }
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

const renderPreview = async () => {
  await renderRuntime.renderPreview()
}

const maybeRender = () => {
  if (autoRenderToggle.checked) {
    renderRuntime.scheduleRender()
  }
}

renderRuntime = createRenderRuntimeController({
  cdnImports,
  importFromCdnWithFallback,
  renderMode,
  styleMode,
  shadowToggle,
  getCssSource: () => getCssSource(),
  getJsxSource: () => getJsxSource(),
  getPreviewHost: () => previewHost,
  setPreviewHost: nextHost => {
    previewHost = nextHost
  },
  applyPreviewBackgroundColor: color =>
    previewBackground.applyPreviewBackgroundColor(color),
  getPreviewBackgroundColor: () => previewBackground.getPreviewBackgroundColor(),
  clearStyleDiagnostics: () => clearDiagnosticsScope('styles'),
  setStyleDiagnosticsDetails,
  setStatus,
  setRenderedStatus,
  onFirstRenderComplete: () => {},
  setCdnLoading,
})

const setJsxSource = value => {
  if (jsxCodeEditor) {
    suppressEditorChangeSideEffects = true
    try {
      jsxCodeEditor.setValue(value)
    } finally {
      suppressEditorChangeSideEffects = false
    }
  }
  jsxEditor.value = value
}

const setCssSource = value => {
  if (cssCodeEditor) {
    suppressEditorChangeSideEffects = true
    try {
      cssCodeEditor.setValue(value)
    } finally {
      suppressEditorChangeSideEffects = false
    }
  }
  cssEditor.value = value
}

const clearComponentSource = () => {
  setJsxSource('')
  clearDiagnosticsScope('component')
  typeDiagnostics.clearTypeDiagnosticsState()
  clearComponentLintDiagnosticsState()
  setStatus('Component cleared', 'neutral')
  renderRuntime.clearPreview()
}

const clearStylesSource = () => {
  setCssSource('')
  clearDiagnosticsScope('styles')
  clearStylesLintDiagnosticsState()
  setStatus('Styles cleared', 'neutral')
  maybeRender()
}

const confirmClearSource = ({ label, onConfirm }) => {
  const supportsModalDialog =
    clearConfirmDialog instanceof HTMLDialogElement &&
    typeof clearConfirmDialog.showModal === 'function'

  if (!supportsModalDialog) {
    if (
      window.confirm(
        `Clear ${label.toLowerCase()} source? This action will remove all text from the editor.`,
      )
    ) {
      onConfirm()
    }
    return
  }

  if (clearConfirmDialog.open) {
    return
  }

  if (clearConfirmTitle) {
    clearConfirmTitle.textContent = `Clear ${label} source?`
  }

  if (clearConfirmCopy) {
    clearConfirmCopy.textContent =
      'This action will remove all text from the editor. This cannot be undone.'
  }

  pendingClearAction = onConfirm
  clearConfirmDialog.showModal()
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

const initializePreviewBackgroundPicker = () => {
  previewBackground.initializePreviewBackgroundPicker()
}

const updateRenderButtonVisibility = () => {
  renderButton.hidden = autoRenderToggle.checked
}

renderMode.addEventListener('change', () => {
  resetDiagnosticsFlow()

  if (renderMode.value === 'react' && !hasAppliedReactModeDefault) {
    hasAppliedReactModeDefault = true
    setJsxSource(defaultReactJsx)
  }

  maybeRender()
})
styleMode.addEventListener('change', () => {
  resetDiagnosticsFlow()

  if (cssCodeEditor) {
    suppressEditorChangeSideEffects = true
    try {
      cssCodeEditor.setLanguage(getStyleEditorLanguage(styleMode.value))
    } finally {
      suppressEditorChangeSideEffects = false
    }
  }
  maybeRender()
})
shadowToggle.addEventListener('change', maybeRender)
autoRenderToggle.addEventListener('change', () => {
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
    typeDiagnostics.triggerTypeDiagnostics({ userInitiated: true })
  })
}
if (lintComponentButton) {
  lintComponentButton.addEventListener('click', () => {
    void runComponentLint({ userInitiated: true })
  })
}
if (lintStylesButton) {
  lintStylesButton.addEventListener('click', () => {
    void runStylesLint({ userInitiated: true })
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
      pendingClearAction?.()
    }
    pendingClearAction = null
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
jsxEditor.addEventListener('input', maybeRender)
jsxEditor.addEventListener('input', markTypeDiagnosticsStale)
jsxEditor.addEventListener('input', markComponentLintDiagnosticsStale)
cssEditor.addEventListener('input', maybeRender)
cssEditor.addEventListener('input', markStylesLintDiagnosticsStale)

for (const button of appGridLayoutButtons) {
  button.addEventListener('click', () => {
    const nextLayout = button.dataset.appGridLayout
    if (!nextLayout) {
      return
    }
    applyAppGridLayout(nextLayout)
    applyPanelCollapseState()
  })
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
}

if (typeof compactViewportMediaQuery.addEventListener === 'function') {
  compactViewportMediaQuery.addEventListener('change', handleCompactViewportChange)
} else {
  compactViewportMediaQuery.onchange = handleCompactViewportChange
}

window.addEventListener('beforeunload', () => {
  clearComponentLintRecheckTimer()
  clearStylesLintRecheckTimer()
  lintDiagnostics.dispose()
})

applyAppGridLayout(getInitialAppGridLayout(), { persist: false })
applyTheme(getInitialTheme(), { persist: false })
applyEditorToolsVisibility()
applyPanelCollapseState()

updateRenderButtonVisibility()
renderDiagnosticsScope('component')
renderDiagnosticsScope('styles')
updateDiagnosticsToggleLabel()
updateUiIssueIndicators()
setDiagnosticsDrawerOpen(false)
setTypeDiagnosticsDetails({ headline: '' })
renderRuntime.setStyleCompiling(false)
setCdnLoading(true)
initializePreviewBackgroundPicker()
void initializeCodeEditors()
renderPreview()
