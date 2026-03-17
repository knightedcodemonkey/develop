import {
  cdnImports,
  getTypeScriptLibUrls,
  importFromCdnWithFallback,
} from './modules/cdn.js'
import { createCodeMirrorEditor } from './modules/editor-codemirror.js'
import { defaultCss, defaultJsx, defaultReactJsx } from './modules/defaults.js'
import { createDiagnosticsUiController } from './modules/diagnostics-ui.js'
import { createLayoutThemeController } from './modules/layout-theme.js'
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

const diagnosticsUi = createDiagnosticsUiController({
  diagnosticsToggle,
  diagnosticsDrawer,
  diagnosticsComponent,
  diagnosticsStyles,
  statusNode,
})

const {
  clearAllDiagnostics,
  clearDiagnosticsScope,
  decrementTypeDiagnosticsRuns,
  getActiveTypeDiagnosticsRuns,
  getDiagnosticsDrawerOpen,
  incrementTypeDiagnosticsRuns,
  renderDiagnosticsScope,
  setDiagnosticsDrawerOpen,
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
  getJsxSource: () => getJsxSource(),
  setTypecheckButtonLoading,
  setTypeDiagnosticsDetails,
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
})

const markTypeDiagnosticsStale = () => {
  typeDiagnostics.markTypeDiagnosticsStale()
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
  setStatus('Component cleared', 'neutral')
  renderRuntime.clearPreview()
}

const clearStylesSource = () => {
  setCssSource('')
  clearDiagnosticsScope('styles')
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
  if (renderMode.value === 'react' && !hasAppliedReactModeDefault) {
    hasAppliedReactModeDefault = true
    setJsxSource(defaultReactJsx)
    markTypeDiagnosticsStale()
  }

  maybeRender()
})
styleMode.addEventListener('change', () => {
  if (cssCodeEditor) {
    cssCodeEditor.setLanguage(getStyleEditorLanguage(styleMode.value))
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
    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered', 'neutral')
    }
  })
}
if (diagnosticsClearAll) {
  diagnosticsClearAll.addEventListener('click', () => {
    clearAllDiagnostics()
    typeDiagnostics.clearTypeDiagnosticsState()
    if (statusNode.textContent.startsWith('Rendered (Type errors:')) {
      setStatus('Rendered', 'neutral')
    }
  })
}
if (typecheckButton) {
  typecheckButton.addEventListener('click', () => {
    typeDiagnostics.triggerTypeDiagnostics()
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
cssEditor.addEventListener('input', maybeRender)

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
