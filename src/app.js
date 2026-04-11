import {
  cdnImports,
  getTypePackageFileUrls,
  getTypeScriptLibUrls,
  importFromCdnWithFallback,
} from './modules/cdn.js'
import { createCodeMirrorEditor } from './modules/editor-codemirror.js'
import { defaultCss, defaultJsx } from './modules/defaults.js'
import { createDiagnosticsUiController } from './modules/diagnostics-ui.js'
import { createGitHubChatDrawer } from './modules/github-chat-drawer/drawer.js'
import { createGitHubByotControls } from './modules/github-byot-controls.js'
import {
  formatActivePrReference,
  getActivePrContextSyncKey,
} from './modules/github-pr-context.js'
import { createGitHubPrEditorSyncController } from './modules/github-pr-editor-sync.js'
import { createGitHubPrDrawer } from './modules/github-pr-drawer.js'
import { createLayoutThemeController } from './modules/layout-theme.js'
import { createLintDiagnosticsController } from './modules/lint-diagnostics.js'
import { createPreviewBackgroundController } from './modules/preview-background.js'
import { createRenderRuntimeController } from './modules/render-runtime.js'
import { createTypeDiagnosticsController } from './modules/type-diagnostics.js'
import { collectTopLevelDeclarations } from './modules/jsx-top-level-declarations.js'
import { ensureJsxTransformSource } from './modules/jsx-transform-runtime.js'
import { createEditorPoolManager } from './modules/editor-pool-manager.js'
import { createWorkspaceTabsState } from './modules/workspace-tabs-state.js'
import {
  createDebouncedWorkspaceSaver,
  createWorkspaceStorageAdapter,
} from './modules/workspace-storage.js'

const statusNode = document.getElementById('status')
const appGrid = document.querySelector('.app-grid')
const githubAiControls = document.getElementById('github-ai-controls')
const githubTokenInput = document.getElementById('github-token-input')
const githubTokenInfo = document.getElementById('github-token-info')
const githubTokenInfoPanel = document.getElementById('github-token-info-panel')
const githubTokenAdd = document.getElementById('github-token-add')
const githubTokenDelete = document.getElementById('github-token-delete')
const aiChatToggle = document.getElementById('ai-chat-toggle')
const aiChatDrawer = document.getElementById('ai-chat-drawer')
const aiChatClose = document.getElementById('ai-chat-close')
const aiChatClear = document.getElementById('ai-chat-clear')
const aiChatPrompt = document.getElementById('ai-chat-prompt')
const aiChatModel = document.getElementById('ai-chat-model')
const aiChatIncludeEditors = document.getElementById('ai-chat-include-editors')
const aiChatSend = document.getElementById('ai-chat-send')
const aiChatStatus = document.getElementById('ai-chat-status')
const aiChatRepository = document.getElementById('ai-chat-repository')
const aiChatMessages = document.getElementById('ai-chat-messages')
const githubPrToggle = document.getElementById('github-pr-toggle')
const githubPrToggleLabel = document.getElementById('github-pr-toggle-label')
const githubPrToggleIcon = document.getElementById('github-pr-toggle-icon')
const githubPrToggleIconPath = document.getElementById('github-pr-toggle-icon-path')
const githubPrContextClose = document.getElementById('github-pr-context-close')
const githubPrContextDisconnect = document.getElementById('github-pr-context-disconnect')
const githubPrDrawer = document.getElementById('github-pr-drawer')
const openPrTitle = document.getElementById('open-pr-title')
const githubPrClose = document.getElementById('github-pr-close')
const githubPrStatus = document.getElementById('github-pr-status')
const githubPrRepoSelect = document.getElementById('github-pr-repo-select')
const githubPrBaseBranch = document.getElementById('github-pr-base-branch')
const githubPrHeadBranch = document.getElementById('github-pr-head-branch')
const githubPrComponentPath = document.getElementById('github-pr-component-path')
const githubPrStylesPath = document.getElementById('github-pr-styles-path')
const githubPrTitle = document.getElementById('github-pr-title')
const githubPrBody = document.getElementById('github-pr-body')
const githubPrCommitMessage = document.getElementById('github-pr-commit-message')
const githubPrIncludeAppWrapper = document.getElementById('github-pr-include-app-wrapper')
const githubPrLocalContextSelect = document.getElementById(
  'github-pr-local-context-select',
)
const githubPrLocalContextRemove = document.getElementById(
  'github-pr-local-context-remove',
)
const githubPrSubmit = document.getElementById('github-pr-submit')
const componentPrSyncIcon = document.getElementById('component-pr-sync-icon')
const componentPrSyncIconPath = document.getElementById('component-pr-sync-icon-path')
const stylesPrSyncIcon = document.getElementById('styles-pr-sync-icon')
const stylesPrSyncIconPath = document.getElementById('styles-pr-sync-icon-path')
const componentEditorHeaderLabel = document.querySelector('#editor-header-component span')
const stylesEditorHeaderLabel = document.querySelector('#editor-header-styles span')
const aiControlsToggle = document.getElementById('ai-controls-toggle')
const appThemeButtons = document.querySelectorAll('[data-app-theme]')
const workspaceTabsStrip = document.getElementById('workspace-tabs-strip')
const editorToolsButtons = document.querySelectorAll('[data-editor-tools-toggle]')
const panelCollapseButtons = document.querySelectorAll('[data-panel-collapse]')
const componentEditorPanel = document.getElementById('editor-panel-component')
const stylesEditorPanel = document.getElementById('editor-panel-styles')
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
const appToast = document.getElementById('app-toast')
const previewBgColorInput = document.getElementById('preview-bg-color')
const clearConfirmDialog = document.getElementById('clear-confirm-dialog')
const clearConfirmTitle = document.getElementById('clear-confirm-title')
const clearConfirmCopy = document.getElementById('clear-confirm-copy')
const clearConfirmButton = clearConfirmDialog?.querySelector('button[value="confirm"]')

const defaultComponentTabPath = 'src/components/App.tsx'
const defaultStylesTabPath = 'src/styles/app.css'
const defaultComponentTabName = 'App.tsx'
const defaultStylesTabName = 'app.css'
const defaultEntryTabDirectory = 'src/components'
const allowedEntryTabFileNames = new Set(['app.tsx', 'app.js'])
const editorKinds = ['component', 'styles']
const editorPanelsByKind = {
  component: componentEditorPanel,
  styles: stylesEditorPanel,
}
const editorHeaderLabelByKind = {
  component: componentEditorHeaderLabel,
  styles: stylesEditorHeaderLabel,
}
const defaultTabNameByKind = {
  component: defaultComponentTabName,
  styles: defaultStylesTabName,
}

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
let appToastDismissTimer = null
const workspaceStorage = createWorkspaceStorageAdapter()
let workspaceSaver = null
let activeWorkspaceRecordId = ''
let activeWorkspaceCreatedAt = null
let isApplyingWorkspaceSnapshot = false
let hasCompletedInitialWorkspaceBootstrap = false
const workspaceTabsState = createWorkspaceTabsState({
  tabs: [
    {
      id: 'component',
      name: defaultComponentTabName,
      path: defaultComponentTabPath,
      language: 'javascript-jsx',
      role: 'entry',
      isActive: true,
      content: defaultJsx,
    },
    {
      id: 'styles',
      name: defaultStylesTabName,
      path: defaultStylesTabPath,
      language: 'css',
      role: 'module',
      isActive: false,
      content: defaultCss,
    },
  ],
  activeTabId: 'component',
})
const editorPool = createEditorPoolManager({ maxMounted: 2 })
let workspaceTabRenameState = {
  tabId: '',
}
let isRenderingWorkspaceTabs = false
let hasPendingWorkspaceTabsRender = false
const clipboardSupported = Boolean(navigator.clipboard?.writeText)
const githubPrOpenIcon = {
  viewBox: '0 0 16 16',
  path: 'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
}
const githubPrPushCommitIcon = {
  viewBox: '0 0 24 24',
  path: 'M16.944 11h4.306a.75.75 0 0 1 0 1.5h-4.306a5.001 5.001 0 0 1-9.888 0H2.75a.75.75 0 0 1 0-1.5h4.306a5.001 5.001 0 0 1 9.888 0Zm-1.444.75a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0Z',
}

const showAppToast = message => {
  if (!(appToast instanceof HTMLElement)) {
    return
  }

  if (appToastDismissTimer) {
    clearTimeout(appToastDismissTimer)
    appToastDismissTimer = null
  }

  appToast.textContent = message
  appToast.hidden = false
  appToast.dataset.open = 'true'

  appToastDismissTimer = setTimeout(() => {
    appToast.dataset.open = 'false'
    appToastDismissTimer = setTimeout(() => {
      appToast.hidden = true
    }, 190)
  }, 4500)
}

const previewBackground = createPreviewBackgroundController({
  previewBgColorInput,
  getPreviewHost: () => previewHost,
})

const layoutTheme = createLayoutThemeController({
  appThemeButtons,
  syncPreviewBackgroundPickerFromTheme: () =>
    previewBackground.syncPreviewBackgroundPickerFromTheme(),
})

const { applyTheme, getInitialTheme } = layoutTheme

const compactViewportMediaQuery = window.matchMedia('(max-width: 900px)')
let compactAiControlsOpen = false
let githubTokenInfoOpen = false

const setGitHubTokenInfoOpen = isOpen => {
  if (!(githubTokenInfo instanceof HTMLButtonElement) || !githubTokenInfoPanel) {
    return
  }

  githubTokenInfoOpen = Boolean(isOpen)
  githubTokenInfo.setAttribute('aria-expanded', githubTokenInfoOpen ? 'true' : 'false')

  if (githubTokenInfoOpen) {
    githubTokenInfoPanel.removeAttribute('hidden')
    return
  }

  githubTokenInfoPanel.setAttribute('hidden', '')
}

const setCompactAiControlsOpen = isOpen => {
  if (!(aiControlsToggle instanceof HTMLButtonElement) || !githubAiControls) {
    return
  }

  aiControlsToggle.removeAttribute('hidden')

  if (!isCompactViewport()) {
    compactAiControlsOpen = false
    setGitHubTokenInfoOpen(false)
    aiControlsToggle.setAttribute('aria-expanded', 'false')
    githubAiControls.removeAttribute('data-compact-open')
    githubAiControls.removeAttribute('hidden')
    return
  }

  compactAiControlsOpen = Boolean(isOpen)
  aiControlsToggle.setAttribute('aria-expanded', compactAiControlsOpen ? 'true' : 'false')
  githubAiControls.dataset.compactOpen = compactAiControlsOpen ? 'true' : 'false'

  if (!compactAiControlsOpen) {
    setGitHubTokenInfoOpen(false)
  }
}

const isCompactViewport = () => compactViewportMediaQuery.matches

const getPanelCollapseAxis = panelName => {
  if (isCompactViewport()) {
    return 'vertical'
  }

  if (panelName === 'preview') {
    return 'horizontal'
  }

  if (panelName === 'component' || panelName === 'styles') {
    return 'vertical'
  }

  return 'vertical'
}

const getPanelCollapseDirection = panelName => {
  const axis = getPanelCollapseAxis(panelName)
  if (axis !== 'horizontal') {
    return 'none'
  }

  if (panelName === 'preview') {
    return 'right'
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

  if (componentEditorPanel) {
    const isCollapsed = panelCollapseState.component
    componentEditorPanel.classList.toggle(
      'panel--collapsed-vertical',
      isCollapsed && componentAxis === 'vertical',
    )
    componentEditorPanel.classList.toggle(
      'panel--collapsed-horizontal',
      isCollapsed && componentAxis === 'horizontal',
    )
  }

  if (stylesEditorPanel) {
    const isCollapsed = panelCollapseState.styles
    stylesEditorPanel.classList.toggle(
      'panel--collapsed-vertical',
      isCollapsed && stylesAxis === 'vertical',
    )
    stylesEditorPanel.classList.toggle(
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

const githubAiContextState = {
  token: null,
  selectedRepository: null,
  writableRepositories: [],
  activePrContext: null,
  activePrEditorSyncKey: '',
  hasSyncedActivePrEditorContent: false,
}

let chatDrawerController = {
  setOpen: () => {},
  setSelectedRepository: () => {},
  setToken: () => {},
  dispose: () => {},
}

let prDrawerController = {
  setOpen: () => {},
  setSelectedRepository: () => {},
  getActivePrContext: () => null,
  clearActivePrContext: () => {},
  closeActivePullRequestOnGitHub: async () => null,
  setToken: () => {},
  syncRepositories: () => {},
  dispose: () => {},
}

const setGitHubPrToggleVisual = mode => {
  if (
    !(githubPrToggle instanceof HTMLButtonElement) ||
    !(githubPrToggleLabel instanceof HTMLElement) ||
    !(githubPrToggleIcon instanceof SVGElement) ||
    !(githubPrToggleIconPath instanceof SVGPathElement)
  ) {
    return
  }

  const isPushCommitMode = mode === 'push-commit'
  const label = isPushCommitMode ? 'Push' : 'Open PR'
  const title = isPushCommitMode
    ? 'Push commit to active pull request branch'
    : 'Open pull request'
  const icon = isPushCommitMode ? githubPrPushCommitIcon : githubPrOpenIcon

  githubPrToggleLabel.textContent = label
  githubPrToggle.title = title
  githubPrToggle.setAttribute('aria-label', title)
  githubPrToggleIcon.setAttribute('viewBox', icon.viewBox)
  githubPrToggleIconPath.setAttribute('d', icon.path)
}

const syncEditorPrContextIndicators = shouldShow => {
  const iconNodes = [componentPrSyncIcon, stylesPrSyncIcon]
  const iconPathNodes = [componentPrSyncIconPath, stylesPrSyncIconPath]

  for (const iconPath of iconPathNodes) {
    if (iconPath instanceof SVGPathElement) {
      iconPath.setAttribute('d', githubPrOpenIcon.path)
    }
  }

  for (const icon of iconNodes) {
    if (!(icon instanceof SVGElement)) {
      continue
    }

    icon.setAttribute('viewBox', githubPrOpenIcon.viewBox)
    icon.dataset.visible = shouldShow ? 'true' : 'false'
    icon.toggleAttribute('hidden', !shouldShow)
  }
}

const syncActivePrContextUi = activeContext => {
  githubAiContextState.activePrContext = activeContext ?? null
  const nextSyncKey = getActivePrContextSyncKey(activeContext)

  if (!nextSyncKey) {
    githubAiContextState.activePrEditorSyncKey = ''
    githubAiContextState.hasSyncedActivePrEditorContent = false
  } else if (githubAiContextState.activePrEditorSyncKey !== nextSyncKey) {
    githubAiContextState.activePrEditorSyncKey = nextSyncKey
    githubAiContextState.hasSyncedActivePrEditorContent = false
  }

  const hasActiveContext = Boolean(activeContext?.prTitle)
  const shouldShowEditorSyncIndicators =
    hasActiveContext && githubAiContextState.hasSyncedActivePrEditorContent

  setGitHubPrToggleVisual(hasActiveContext ? 'push-commit' : 'open-pr')
  syncEditorPrContextIndicators(shouldShowEditorSyncIndicators)

  if (!hasActiveContext) {
    githubPrContextClose?.setAttribute('hidden', '')
    githubPrContextDisconnect?.setAttribute('hidden', '')
    return
  }

  githubPrContextClose?.removeAttribute('hidden')
  githubPrContextDisconnect?.removeAttribute('hidden')
}

const syncAiChatTokenVisibility = token => {
  const hasToken = typeof token === 'string' && token.trim().length > 0

  if (hasToken) {
    aiChatToggle?.removeAttribute('hidden')

    githubPrToggle?.removeAttribute('hidden')

    if (githubAiContextState.activePrContext) {
      githubPrContextClose?.removeAttribute('hidden')
      githubPrContextDisconnect?.removeAttribute('hidden')
    } else {
      githubPrContextClose?.setAttribute('hidden', '')
      githubPrContextDisconnect?.setAttribute('hidden', '')
    }
    return
  }

  aiChatToggle?.setAttribute('hidden', '')
  aiChatToggle?.setAttribute('aria-expanded', 'false')
  githubAiContextState.activePrContext = null
  githubAiContextState.activePrEditorSyncKey = ''
  githubAiContextState.hasSyncedActivePrEditorContent = false
  syncEditorPrContextIndicators(false)
  setGitHubPrToggleVisual('open-pr')
  githubPrToggle?.setAttribute('hidden', '')
  githubPrToggle?.setAttribute('aria-expanded', 'false')
  githubPrContextClose?.setAttribute('hidden', '')
  githubPrContextDisconnect?.setAttribute('hidden', '')
  chatDrawerController.setOpen(false)
  prDrawerController.setOpen(false)
}

const byotControls = createGitHubByotControls({
  controlsRoot: githubAiControls,
  tokenInput: githubTokenInput,
  tokenInfoButton: githubTokenInfo,
  tokenAddButton: githubTokenAdd,
  tokenDeleteButton: githubTokenDelete,
  onRepositoryChange: repository => {
    githubAiContextState.selectedRepository = repository
    chatDrawerController.setSelectedRepository(repository)
    prDrawerController.setSelectedRepository(repository)

    activeWorkspaceRecordId = ''
    activeWorkspaceCreatedAt = null
    void loadPreferredWorkspaceContext().catch(() => {
      /* noop */
    })
  },
  onWritableRepositoriesChange: ({ repositories }) => {
    githubAiContextState.writableRepositories = Array.isArray(repositories)
      ? [...repositories]
      : []
    prDrawerController.syncRepositories()
  },
  onTokenDeleteRequest: onConfirm => {
    confirmAction({
      title: 'Remove saved GitHub token?',
      copy: 'This action removes the token from browser storage. You can add another token at any time.',
      confirmButtonText: 'Remove',
      onConfirm,
    })
  },
  onTokenChange: token => {
    githubAiContextState.token = token
    syncAiChatTokenVisibility(token)
    chatDrawerController.setToken(token)
    prDrawerController.setToken(token)
  },
  setStatus,
})

githubAiContextState.selectedRepository = byotControls.getSelectedRepository()
githubAiContextState.token = byotControls.getToken()
githubAiContextState.writableRepositories = byotControls.getWritableRepositories()

const getCurrentGitHubToken = () => githubAiContextState.token ?? byotControls.getToken()

const getCurrentSelectedRepository = () =>
  githubAiContextState.selectedRepository ?? byotControls.getSelectedRepository()

const toWorkspaceIdentitySegment = value => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!normalized) {
    return ''
  }

  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const toWorkspaceRecordId = ({ repositoryFullName, headBranch }) => {
  const repoSegment = toWorkspaceIdentitySegment(repositoryFullName)
  const headSegment = toWorkspaceIdentitySegment(headBranch) || 'draft'

  if (repoSegment) {
    return `repo_${repoSegment}_${headSegment}`
  }

  return `workspace_${headSegment}`
}

const getWorkspaceContextSnapshot = () => {
  return {
    repositoryFullName: getCurrentSelectedRepository(),
    baseBranch:
      typeof githubPrBaseBranch?.value === 'string'
        ? githubPrBaseBranch.value.trim()
        : '',
    headBranch:
      typeof githubPrHeadBranch?.value === 'string'
        ? githubPrHeadBranch.value.trim()
        : '',
    prTitle: typeof githubPrTitle?.value === 'string' ? githubPrTitle.value.trim() : '',
  }
}

const styleTabLanguages = new Set(['css', 'less', 'sass', 'module'])
let loadedComponentTabId = 'component'
let loadedStylesTabId = 'styles'

const toNonEmptyWorkspaceText = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''

const isStyleTabLanguage = language =>
  styleTabLanguages.has(toNonEmptyWorkspaceText(language))

const getTabKind = tab => (isStyleTabLanguage(tab?.language) ? 'styles' : 'component')

const getWorkspaceTabByKind = kind => {
  const tabs = workspaceTabsState.getTabs()
  const normalizedKind = kind === 'styles' ? 'styles' : 'component'
  return (
    tabs.find(
      tab =>
        getTabKind(tab) === normalizedKind &&
        tab.id === workspaceTabsState.getActiveTabId(),
    ) ??
    tabs.find(tab => getTabKind(tab) === normalizedKind) ??
    null
  )
}

const getActiveWorkspaceTab = () =>
  workspaceTabsState.getTab(workspaceTabsState.getActiveTabId())

const toStyleModeForTabLanguage = language => {
  const normalized = toNonEmptyWorkspaceText(language)
  if (normalized === 'less') {
    return 'less'
  }

  if (normalized === 'sass') {
    return 'sass'
  }

  if (normalized === 'module') {
    return 'module'
  }

  return 'css'
}

const syncHeaderLabels = () => {
  for (const editorKind of editorKinds) {
    const tab =
      editorKind === 'styles'
        ? (workspaceTabsState.getTab(loadedStylesTabId) ??
          getWorkspaceTabByKind('styles'))
        : (workspaceTabsState.getTab(loadedComponentTabId) ??
          getWorkspaceTabByKind('component'))
    const headerLabel = editorHeaderLabelByKind[editorKind]

    if (headerLabel) {
      headerLabel.textContent =
        toNonEmptyWorkspaceText(tab?.name) || defaultTabNameByKind[editorKind]
    }
  }
}

const persistActiveTabEditorContent = () => {
  const activeTab = getActiveWorkspaceTab()

  if (!activeTab) {
    return
  }

  const nextContent = getTabKind(activeTab) === 'styles' ? getCssSource() : getJsxSource()

  if (nextContent === activeTab.content) {
    return
  }

  workspaceTabsState.upsertTab(
    {
      ...activeTab,
      content: nextContent,
      lastModified: Date.now(),
      isActive: true,
    },
    { emitReason: 'tabContentSync' },
  )
}

const loadWorkspaceTabIntoEditor = tab => {
  if (!tab || typeof tab !== 'object') {
    return
  }

  const nextContent = typeof tab.content === 'string' ? tab.content : ''

  if (getTabKind(tab) === 'styles') {
    loadedStylesTabId = tab.id
    setCssSource(nextContent)
    const nextStyleMode = toStyleModeForTabLanguage(tab.language)
    if (styleMode.value !== nextStyleMode) {
      styleMode.value = nextStyleMode
    }
    if (cssCodeEditor) {
      suppressEditorChangeSideEffects = true
      try {
        cssCodeEditor.setLanguage(getStyleEditorLanguage(nextStyleMode))
      } finally {
        suppressEditorChangeSideEffects = false
      }
    }
    setVisibleEditorPanelForKind('styles')
    editorPool.activate('styles')
  } else {
    loadedComponentTabId = tab.id
    setJsxSource(nextContent)
    setVisibleEditorPanelForKind('component')
    editorPool.activate('component')
  }

  syncHeaderLabels()
}

const createWorkspaceTabId = prefix => {
  const seed = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${seed}`
}

const splitWorkspacePath = value => {
  const normalized = toNonEmptyWorkspaceText(value)
  if (!normalized) {
    return []
  }

  return normalized.split(/[\\/]+/).filter(Boolean)
}

const getPathFileName = path => {
  const segments = splitWorkspacePath(path)
  return segments.length > 0 ? segments[segments.length - 1] : ''
}

const getPathDirectory = path => {
  const segments = splitWorkspacePath(path)
  if (segments.length <= 1) {
    return defaultEntryTabDirectory
  }

  return segments.slice(0, -1).join('/')
}

const normalizeEntryTabName = value => {
  const normalized = toNonEmptyWorkspaceText(value)
  if (allowedEntryTabFileNames.has(normalized.toLowerCase())) {
    return normalized
  }

  return defaultComponentTabName
}

const getWorkspaceTabDisplay = tab => {
  const fullPath =
    toNonEmptyWorkspaceText(tab?.path) || toNonEmptyWorkspaceText(tab?.name)
  const explicitName = toNonEmptyWorkspaceText(tab?.name)
  const explicitFileName = getPathFileName(explicitName)
  return {
    fileName: explicitFileName || explicitName || getPathFileName(fullPath),
    fullPath,
  }
}

const normalizeEntryTabPath = (path, { preferredFileName = '' } = {}) => {
  const normalizedPath = toNonEmptyWorkspaceText(path)
  const directory = getPathDirectory(normalizedPath || defaultComponentTabPath)
  const requestedFileName =
    toNonEmptyWorkspaceText(preferredFileName) ||
    getPathFileName(normalizedPath || defaultComponentTabPath)
  const fileName = normalizeEntryTabName(requestedFileName)

  return `${directory}/${fileName}`
}

const normalizeModuleTabPathForRename = (path, nextName) => {
  const currentPath = toNonEmptyWorkspaceText(path)
  const normalizedNextName = toNonEmptyWorkspaceText(nextName)
  const nextFileName = getPathFileName(normalizedNextName) || normalizedNextName

  if (!nextFileName) {
    return currentPath
  }

  if (!currentPath) {
    return nextFileName
  }

  const directory = getPathDirectory(currentPath)
  return `${directory}/${nextFileName}`
}

const setVisibleEditorPanelForKind = kind => {
  const nextVisibleKind = kind === 'styles' ? 'styles' : 'component'

  for (const editorKind of editorKinds) {
    const panel = editorPanelsByKind[editorKind]
    if (!panel) {
      continue
    }

    if (editorKind === nextVisibleKind) {
      panel.removeAttribute('hidden')
      continue
    }

    panel.setAttribute('hidden', '')
  }
}

const makeUniqueTabPath = ({ basePath, suffix = '' }) => {
  const existingPaths = new Set(
    workspaceTabsState
      .getTabs()
      .map(tab => toNonEmptyWorkspaceText(tab.path))
      .filter(Boolean),
  )

  if (!existingPaths.has(basePath)) {
    return basePath
  }

  let attempt = 2
  while (attempt < 500) {
    const candidate = basePath.replace(/(\.[^./]+)$/u, `${suffix || ''}-${attempt}$1`)
    if (!existingPaths.has(candidate)) {
      return candidate
    }
    attempt += 1
  }

  return `${basePath}-${Date.now().toString(36)}`
}

const ensureWorkspaceTabsShape = tabs => {
  const inputTabs = Array.isArray(tabs) ? tabs : []
  const hasComponent = inputTabs.some(tab => tab?.id === 'component')
  const hasStyles = inputTabs.some(tab => tab?.id === 'styles')
  const nextTabs = [...inputTabs]

  if (!hasComponent) {
    nextTabs.unshift({
      id: 'component',
      name: defaultComponentTabName,
      path: defaultComponentTabPath,
      language: 'javascript-jsx',
      role: 'entry',
      content: defaultJsx,
      isActive: true,
    })
  }

  if (!hasStyles) {
    nextTabs.push({
      id: 'styles',
      name: defaultStylesTabName,
      path: defaultStylesTabPath,
      language: 'css',
      role: 'module',
      content: defaultCss,
      isActive: false,
    })
  }

  return nextTabs.map(tab => {
    if (tab?.id === 'component') {
      const normalizedEntryPath = normalizeEntryTabPath(tab.path, {
        preferredFileName: tab.name,
      })
      return {
        ...tab,
        role: 'entry',
        language: 'javascript-jsx',
        path: normalizedEntryPath,
        name: getPathFileName(normalizedEntryPath) || defaultComponentTabName,
      }
    }

    if (tab?.id === 'styles') {
      const normalizedStylesPath =
        toNonEmptyWorkspaceText(tab.path) || defaultStylesTabPath
      const normalizedStylesNameInput = toNonEmptyWorkspaceText(tab.name)
      return {
        ...tab,
        language: isStyleTabLanguage(tab.language) ? tab.language : 'css',
        role: 'module',
        path: normalizedStylesPath,
        name:
          !normalizedStylesNameInput ||
          normalizedStylesNameInput.toLowerCase() === 'styles'
            ? getPathFileName(normalizedStylesPath) || defaultStylesTabName
            : normalizedStylesNameInput,
      }
    }

    const nextPath = toNonEmptyWorkspaceText(tab?.path)
    return {
      ...tab,
      role: 'module',
      language: isStyleTabLanguage(tab?.language) ? tab.language : 'javascript-jsx',
      path: nextPath,
      name: toNonEmptyWorkspaceText(tab?.name) || getPathFileName(nextPath) || tab?.id,
    }
  })
}

const resolveWorkspaceActiveTabId = ({ tabs, requestedActiveTabId }) => {
  const nextTabs = Array.isArray(tabs) ? tabs : []
  const requestedId = toNonEmptyWorkspaceText(requestedActiveTabId)

  if (requestedId && nextTabs.some(tab => tab?.id === requestedId)) {
    return requestedId
  }

  if (nextTabs.some(tab => tab?.id === 'component')) {
    return 'component'
  }

  return toNonEmptyWorkspaceText(nextTabs[0]?.id)
}

const buildWorkspaceTabsSnapshot = () => {
  const activeTabId = workspaceTabsState.getActiveTabId()
  return workspaceTabsState.getTabs().map(tab => {
    const isComponentTab = tab.id === 'component'
    const isStylesTab = tab.id === 'styles'
    const currentPath = isComponentTab
      ? typeof githubPrComponentPath?.value === 'string' &&
        githubPrComponentPath.value.trim()
        ? githubPrComponentPath.value.trim()
        : tab.path
      : isStylesTab
        ? typeof githubPrStylesPath?.value === 'string' && githubPrStylesPath.value.trim()
          ? githubPrStylesPath.value.trim()
          : tab.path
        : tab.path

    const currentContent =
      tab.id === activeTabId
        ? getTabKind(tab) === 'styles'
          ? getCssSource()
          : getJsxSource()
        : typeof tab.content === 'string'
          ? tab.content
          : ''

    return {
      ...tab,
      path: currentPath,
      content: currentContent,
      isActive: activeTabId === tab.id,
      lastModified: Date.now(),
    }
  })
}

const getPreviewStylesSource = () => {
  const loadedStylesTab = workspaceTabsState.getTab(loadedStylesTabId)

  if (!loadedStylesTab || getTabKind(loadedStylesTab) !== 'styles') {
    return getCssSource()
  }

  if (workspaceTabsState.getActiveTabId() === loadedStylesTab.id) {
    return getCssSource()
  }

  return typeof loadedStylesTab.content === 'string'
    ? loadedStylesTab.content
    : getCssSource()
}

const buildWorkspaceRecordSnapshot = ({ recordId } = {}) => {
  const context = getWorkspaceContextSnapshot()
  const id =
    recordId ||
    activeWorkspaceRecordId ||
    toWorkspaceRecordId({
      repositoryFullName: context.repositoryFullName,
      headBranch: context.headBranch,
    })

  return {
    id,
    repo: context.repositoryFullName || '',
    base: context.baseBranch || '',
    head: context.headBranch || '',
    prNumber: null,
    prTitle: context.prTitle || '',
    renderMode: normalizeRenderMode(renderMode.value),
    tabs: buildWorkspaceTabsSnapshot(),
    activeTabId: workspaceTabsState.getActiveTabId(),
    createdAt: activeWorkspaceCreatedAt ?? Date.now(),
    lastModified: Date.now(),
  }
}

const updateLocalContextActions = () => {
  if (!(githubPrLocalContextRemove instanceof HTMLButtonElement)) {
    return
  }

  const hasSelection =
    typeof githubPrLocalContextSelect?.value === 'string' &&
    githubPrLocalContextSelect.value.length > 0
  githubPrLocalContextRemove.disabled = !hasSelection
}

const formatWorkspaceOptionLabel = workspace => {
  const contextLabel = 'Local'
  const hasTitle = typeof workspace.prTitle === 'string' && workspace.prTitle.trim()
  const hasHead = typeof workspace.head === 'string' && workspace.head.trim()

  if (hasTitle) {
    return `${contextLabel}: ${workspace.prTitle}`
  }

  if (hasHead) {
    return `${contextLabel}: ${workspace.head}`
  }

  return `${contextLabel}: ${workspace.id}`
}

const refreshLocalContextOptions = async () => {
  if (!(githubPrLocalContextSelect instanceof HTMLSelectElement)) {
    return []
  }

  const selectedRepository = getCurrentSelectedRepository()
  const options = await workspaceStorage.listWorkspaces({
    repo: selectedRepository || '',
  })

  githubPrLocalContextSelect.replaceChildren()

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent =
    options.length > 0 ? 'Select a stored local context' : 'No saved local contexts'
  placeholder.selected = activeWorkspaceRecordId.length === 0
  githubPrLocalContextSelect.append(placeholder)

  for (const workspace of options) {
    const option = document.createElement('option')
    option.value = workspace.id
    option.textContent = formatWorkspaceOptionLabel(workspace)
    option.selected = workspace.id === activeWorkspaceRecordId
    githubPrLocalContextSelect.append(option)
  }

  if (
    activeWorkspaceRecordId &&
    !options.some(workspace => workspace.id === activeWorkspaceRecordId)
  ) {
    activeWorkspaceRecordId = ''
    activeWorkspaceCreatedAt = null
    githubPrLocalContextSelect.value = ''
  }

  updateLocalContextActions()
  return options
}

const applyWorkspaceRecord = async (workspace, { silent = false } = {}) => {
  if (!workspace || typeof workspace !== 'object') {
    return false
  }

  isApplyingWorkspaceSnapshot = true

  try {
    activeWorkspaceRecordId = workspace.id
    activeWorkspaceCreatedAt = workspace.createdAt ?? null

    const nextTabs = ensureWorkspaceTabsShape(workspace.tabs)
    const componentTab = nextTabs.find(tab => tab.id === 'component')
    const stylesTab = nextTabs.find(tab => tab.id === 'styles')

    if (typeof workspace.base === 'string' && githubPrBaseBranch) {
      githubPrBaseBranch.value = workspace.base
    }

    if (typeof workspace.head === 'string' && githubPrHeadBranch) {
      githubPrHeadBranch.value = workspace.head
    }

    if (typeof workspace.prTitle === 'string' && githubPrTitle) {
      githubPrTitle.value = workspace.prTitle
    }

    workspaceTabsState.replaceTabs({
      tabs: nextTabs,
      activeTabId: resolveWorkspaceActiveTabId({
        tabs: nextTabs,
        requestedActiveTabId: workspace.activeTabId,
      }),
    })

    const nextRenderMode = normalizeRenderMode(workspace.renderMode)
    if (renderMode.value !== nextRenderMode) {
      renderMode.value = nextRenderMode
    }

    if (typeof componentTab?.path === 'string' && githubPrComponentPath) {
      githubPrComponentPath.value = componentTab.path
    }

    if (typeof stylesTab?.path === 'string' && githubPrStylesPath) {
      githubPrStylesPath.value = stylesTab.path
    }

    const activeTab = getActiveWorkspaceTab()
    if (activeTab) {
      loadWorkspaceTabIntoEditor(activeTab)
    }

    if (stylesTab && typeof stylesTab.content === 'string') {
      setCssSource(stylesTab.content)
    }

    renderWorkspaceTabs()

    if (hasCompletedInitialWorkspaceBootstrap) {
      maybeRender()
    }
    await refreshLocalContextOptions()
    if (!silent) {
      setStatus('Loaded local workspace context.', 'neutral')
    }

    return true
  } finally {
    isApplyingWorkspaceSnapshot = false
  }
}

workspaceSaver = createDebouncedWorkspaceSaver({
  save: async payload => {
    const saved = await workspaceStorage.upsertWorkspace(payload)
    activeWorkspaceRecordId = saved.id
    activeWorkspaceCreatedAt = saved.createdAt ?? activeWorkspaceCreatedAt
    await refreshLocalContextOptions()
    return saved
  },
  onError: error => {
    const message =
      error instanceof Error ? error.message : 'Could not save local workspace context.'
    setStatus(`Local save failed: ${message}`, 'error')
  },
})

const queueWorkspaceSave = () => {
  if (isApplyingWorkspaceSnapshot || !workspaceSaver) {
    return
  }

  const snapshot = buildWorkspaceRecordSnapshot()
  activeWorkspaceRecordId = snapshot.id
  workspaceSaver.queue(snapshot)
}

const flushWorkspaceSave = async () => {
  if (isApplyingWorkspaceSnapshot || !workspaceSaver) {
    return
  }

  const snapshot = buildWorkspaceRecordSnapshot()
  activeWorkspaceRecordId = snapshot.id
  await workspaceSaver.flushNow(snapshot)
}

const setActiveWorkspaceTab = tabId => {
  const normalizedTabId = toNonEmptyWorkspaceText(tabId)
  if (!normalizedTabId) {
    return
  }

  const currentActiveTabId = workspaceTabsState.getActiveTabId()
  const targetTab = workspaceTabsState.getTab(normalizedTabId)
  if (!targetTab) {
    return
  }

  if (targetTab.id === currentActiveTabId) {
    loadWorkspaceTabIntoEditor(targetTab)
    renderWorkspaceTabs()
    return
  }

  persistActiveTabEditorContent()

  const changed = workspaceTabsState.setActiveTab(targetTab.id)
  const activeTab = getActiveWorkspaceTab()
  if (activeTab) {
    loadWorkspaceTabIntoEditor(activeTab)
  }

  renderWorkspaceTabs()

  if (!changed) {
    return
  }

  void flushWorkspaceSave().catch(() => {
    /* Save failures are already surfaced through saver onError. */
  })
}

const syncEditorFromActiveWorkspaceTab = () => {
  const activeTab = getActiveWorkspaceTab()
  if (!activeTab) {
    return
  }

  loadWorkspaceTabIntoEditor(activeTab)
}

const beginWorkspaceTabRename = tabId => {
  workspaceTabRenameState = {
    tabId: toNonEmptyWorkspaceText(tabId),
  }
  renderWorkspaceTabs()
}

const finishWorkspaceTabRename = ({ tabId, nextName, cancelled = false }) => {
  const normalizedTabId = toNonEmptyWorkspaceText(tabId)
  const tab = workspaceTabsState.getTab(normalizedTabId)

  workspaceTabRenameState = {
    tabId: '',
  }

  if (!tab || cancelled) {
    renderWorkspaceTabs()
    return
  }

  const normalizedNameInput = toNonEmptyWorkspaceText(nextName)
  const normalizedName = getPathFileName(normalizedNameInput) || normalizedNameInput
  if (!normalizedName) {
    setStatus('Tab name cannot be empty.', 'error')
    renderWorkspaceTabs()
    return
  }

  if (
    tab.role === 'entry' &&
    !allowedEntryTabFileNames.has(normalizedName.toLowerCase())
  ) {
    setStatus('Entry tab name must be App.tsx or App.js.', 'error')
    renderWorkspaceTabs()
    return
  }

  const normalizedEntryPath =
    tab.role === 'entry'
      ? normalizeEntryTabPath(tab.path, { preferredFileName: normalizedName })
      : normalizeModuleTabPathForRename(tab.path, normalizedName)
  const normalizedTabName =
    tab.role === 'entry'
      ? getPathFileName(normalizedEntryPath) || defaultComponentTabName
      : getPathFileName(normalizedEntryPath) || normalizedName

  workspaceTabsState.upsertTab({
    ...tab,
    name: normalizedTabName,
    path: normalizedEntryPath,
    lastModified: Date.now(),
  })

  if (tab.role === 'entry' && githubPrComponentPath instanceof HTMLInputElement) {
    githubPrComponentPath.value = normalizedEntryPath
  }

  syncHeaderLabels()
  renderWorkspaceTabs()
  queueWorkspaceSave()
}

const removeWorkspaceTab = tabId => {
  const tab = workspaceTabsState.getTab(tabId)
  if (!tab) {
    return
  }

  if (tab.role === 'entry') {
    setStatus('The entry tab cannot be removed.', 'neutral')
    return
  }

  confirmAction({
    title: `Remove tab ${tab.name}?`,
    copy: 'This removes the tab and its local source content from this workspace context.',
    confirmButtonText: 'Remove tab',
    onConfirm: () => {
      const removedKind = getTabKind(tab)
      persistActiveTabEditorContent()
      const removed = workspaceTabsState.removeTab(tab.id)
      if (!removed) {
        return
      }

      if (loadedComponentTabId === tab.id) {
        loadedComponentTabId =
          workspaceTabsState.getTabs().find(entry => getTabKind(entry) === 'component')
            ?.id || 'component'
      }

      if (loadedStylesTabId === tab.id) {
        loadedStylesTabId =
          workspaceTabsState.getTabs().find(entry => getTabKind(entry) === 'styles')
            ?.id || 'styles'
      }

      const activeTab = getActiveWorkspaceTab()
      if (activeTab) {
        loadWorkspaceTabIntoEditor(activeTab)
      } else {
        const fallbackTab =
          getWorkspaceTabByKind(removedKind === 'styles' ? 'component' : 'styles') ||
          workspaceTabsState.getTabs()[0] ||
          null
        if (fallbackTab) {
          setActiveWorkspaceTab(fallbackTab.id)
        }
      }

      renderWorkspaceTabs()
      queueWorkspaceSave()
      maybeRender()
    },
  })
}

const addWorkspaceTab = () => {
  const activeTab = getActiveWorkspaceTab()
  const normalizedKind = getTabKind(activeTab) === 'styles' ? 'styles' : 'component'
  const basePath =
    normalizedKind === 'styles' ? 'src/styles/module.css' : 'src/components/module.tsx'
  const language = normalizedKind === 'styles' ? 'css' : 'javascript-jsx'
  const path = makeUniqueTabPath({ basePath })
  const tabId = createWorkspaceTabId(normalizedKind === 'styles' ? 'style' : 'module')
  const name = getPathFileName(path) || `${normalizedKind}-tab`

  persistActiveTabEditorContent()

  workspaceTabsState.upsertTab({
    id: tabId,
    name,
    path,
    language,
    role: 'module',
    isActive: false,
    content: '',
    lastModified: Date.now(),
  })

  setActiveWorkspaceTab(tabId)

  if (normalizedKind === 'styles') {
    setStatus('Added style tab.', 'neutral')
  } else {
    setStatus('Added JavaScript tab.', 'neutral')
  }
}

const renderWorkspaceTabs = () => {
  if (!(workspaceTabsStrip instanceof HTMLElement)) {
    return
  }

  if (isRenderingWorkspaceTabs) {
    hasPendingWorkspaceTabsRender = true
    return
  }

  isRenderingWorkspaceTabs = true

  try {
    const tabs = workspaceTabsState.getTabs()
    const activeTabId = workspaceTabsState.getActiveTabId()

    workspaceTabsStrip.replaceChildren()

    for (const tab of tabs) {
      const isActive = tab.id === activeTabId
      const tabContainer = document.createElement('div')
      tabContainer.className = 'workspace-tab'
      tabContainer.setAttribute('role', 'presentation')
      tabContainer.dataset.tabId = tab.id
      tabContainer.setAttribute('aria-selected', isActive ? 'true' : 'false')
      tabContainer.addEventListener('click', event => {
        const clickTarget = event.target
        if (!(clickTarget instanceof Element)) {
          return
        }

        if (
          clickTarget.closest('.workspace-tab__rename, .workspace-tab__remove, input')
        ) {
          return
        }

        setActiveWorkspaceTab(tab.id)
      })

      const isRenaming = workspaceTabRenameState.tabId === tab.id
      if (isRenaming) {
        const renameInput = document.createElement('input')
        renameInput.className = 'workspace-tab__name-input'
        renameInput.value = tab.name
        renameInput.setAttribute('aria-label', `Rename ${tab.name}`)

        let renameResolved = false
        const resolveRename = ({ cancelled = false } = {}) => {
          if (renameResolved) {
            return
          }

          renameResolved = true
          finishWorkspaceTabRename({
            tabId: tab.id,
            nextName: renameInput.value,
            cancelled,
          })
        }

        renameInput.addEventListener('keydown', event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            resolveRename()
          }

          if (event.key === 'Escape') {
            event.preventDefault()
            resolveRename({ cancelled: true })
          }
        })
        renameInput.addEventListener('blur', () => {
          resolveRename()
        })
        tabContainer.append(renameInput)
        workspaceTabsStrip.append(tabContainer)

        queueMicrotask(() => {
          renameInput.focus()
          renameInput.select()
        })
        continue
      }

      const selectButton = document.createElement('button')
      selectButton.className = 'workspace-tab__select'
      selectButton.type = 'button'
      const tabDisplay = getWorkspaceTabDisplay(tab)
      if (tabDisplay.fullPath) {
        selectButton.title = tabDisplay.fullPath
      }

      const fileNameNode = document.createElement('span')
      fileNameNode.className = 'workspace-tab__path-file'
      fileNameNode.textContent = tabDisplay.fileName || tab.name
      selectButton.append(fileNameNode)

      selectButton.setAttribute('role', 'tab')
      selectButton.setAttribute('aria-selected', isActive ? 'true' : 'false')
      selectButton.setAttribute('aria-label', `Open tab ${tab.name}`)
      selectButton.addEventListener('click', event => {
        event.stopPropagation()
        setActiveWorkspaceTab(tab.id)
      })
      selectButton.addEventListener('dblclick', () => {
        beginWorkspaceTabRename(tab.id)
      })
      tabContainer.append(selectButton)

      if (tab.role === 'entry') {
        const metaBadge = document.createElement('span')
        metaBadge.className = 'workspace-tab__meta'
        metaBadge.textContent = 'Entry'
        tabContainer.append(metaBadge)
      }

      const renameButton = document.createElement('button')
      renameButton.className = 'workspace-tab__rename'
      renameButton.type = 'button'
      renameButton.setAttribute('aria-label', `Rename tab ${tab.name}`)
      renameButton.title = `Rename ${tab.name}`
      const renameIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      renameIcon.setAttribute('viewBox', '0 0 24 24')
      renameIcon.setAttribute('aria-hidden', 'true')
      const renamePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      renamePath.setAttribute(
        'd',
        'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
      )
      renameIcon.append(renamePath)
      renameButton.append(renameIcon)
      renameButton.addEventListener('click', () => {
        beginWorkspaceTabRename(tab.id)
      })
      tabContainer.append(renameButton)

      if (tab.role !== 'entry') {
        const removeButton = document.createElement('button')
        removeButton.className = 'workspace-tab__remove'
        removeButton.type = 'button'
        removeButton.textContent = '×'
        removeButton.setAttribute('aria-label', `Remove tab ${tab.name}`)
        removeButton.title = `Remove ${tab.name}`
        removeButton.addEventListener('click', () => {
          removeWorkspaceTab(tab.id)
        })
        tabContainer.append(removeButton)
      }

      workspaceTabsStrip.append(tabContainer)
    }

    const addButton = document.createElement('button')
    addButton.className = 'workspace-tab-add workspace-tab-add--strip'
    addButton.id = 'workspace-tab-add'
    addButton.type = 'button'
    addButton.textContent = '+'
    addButton.setAttribute('aria-label', 'Add tab')
    addButton.title = 'Add tab'
    addButton.addEventListener('click', () => {
      addWorkspaceTab()
    })
    workspaceTabsStrip.append(addButton)
  } finally {
    isRenderingWorkspaceTabs = false
  }

  if (hasPendingWorkspaceTabsRender) {
    hasPendingWorkspaceTabsRender = false
    renderWorkspaceTabs()
    return
  }

  syncEditorFromActiveWorkspaceTab()
}

const loadPreferredWorkspaceContext = async () => {
  const options = await refreshLocalContextOptions()

  if (!Array.isArray(options) || options.length === 0) {
    return
  }

  const preferredId =
    activeWorkspaceRecordId ||
    toWorkspaceRecordId({
      repositoryFullName: getCurrentSelectedRepository(),
      headBranch:
        typeof githubPrHeadBranch?.value === 'string'
          ? githubPrHeadBranch.value.trim()
          : '',
    })

  const preferred = options.find(workspace => workspace.id === preferredId)
  const next = preferred ?? options[0]

  if (!next) {
    return
  }

  await applyWorkspaceRecord(next, { silent: true })
}

const bindWorkspaceMetadataPersistence = element => {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
    return
  }

  const queue = () => {
    queueWorkspaceSave()
  }

  const flush = () => {
    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
  }

  element.addEventListener('input', queue)
  element.addEventListener('change', queue)
  element.addEventListener('blur', flush)
}

const syncTabPathsFromInputs = () => {
  const requestedComponentPath =
    typeof githubPrComponentPath?.value === 'string' && githubPrComponentPath.value.trim()
      ? githubPrComponentPath.value.trim()
      : defaultComponentTabPath
  const componentPath = normalizeEntryTabPath(requestedComponentPath)
  const stylesPath =
    typeof githubPrStylesPath?.value === 'string' && githubPrStylesPath.value.trim()
      ? githubPrStylesPath.value.trim()
      : defaultStylesTabPath

  if (githubPrComponentPath instanceof HTMLInputElement) {
    githubPrComponentPath.value = componentPath
  }

  workspaceTabsState.upsertTab({
    id: 'component',
    path: componentPath,
    name: getPathFileName(componentPath) || defaultComponentTabName,
    language: 'javascript-jsx',
    role: 'entry',
    isActive: workspaceTabsState.getActiveTabId() === 'component',
  })
  workspaceTabsState.upsertTab({
    id: 'styles',
    path: stylesPath,
    name: getPathFileName(stylesPath) || defaultStylesTabName,
    language: 'css',
    role: 'module',
    isActive: workspaceTabsState.getActiveTabId() === 'styles',
  })

  syncHeaderLabels()
  renderWorkspaceTabs()
}

const getCurrentWritableRepositories = () =>
  githubAiContextState.writableRepositories.length > 0
    ? [...githubAiContextState.writableRepositories]
    : byotControls.getWritableRepositories()

const setCurrentSelectedRepository = fullName =>
  byotControls.setSelectedRepository(fullName)

const getTopLevelDeclarations = async source => {
  if (typeof source !== 'string' || !source.trim()) {
    return []
  }

  const transformJsxSource = await ensureJsxTransformSource({
    cdnImports,
    importFromCdnWithFallback,
  })
  return collectTopLevelDeclarations({ source, transformJsxSource })
}

const prEditorSyncController = createGitHubPrEditorSyncController({
  setComponentSource: setJsxSource,
  setStylesSource: setCssSource,
  scheduleRender: () => {
    if (
      autoRenderToggle?.checked &&
      typeof renderRuntime?.scheduleRender === 'function'
    ) {
      renderRuntime.scheduleRender()
    }
  },
})

chatDrawerController = createGitHubChatDrawer({
  toggleButton: aiChatToggle,
  drawer: aiChatDrawer,
  closeButton: aiChatClose,
  promptInput: aiChatPrompt,
  modelSelect: aiChatModel,
  includeEditorsContextToggle: aiChatIncludeEditors,
  sendButton: aiChatSend,
  clearButton: aiChatClear,
  statusNode: aiChatStatus,
  repositoryNode: aiChatRepository,
  messagesNode: aiChatMessages,
  getToken: getCurrentGitHubToken,
  getSelectedRepository: getCurrentSelectedRepository,
  getComponentSource: () => getJsxSource(),
  setComponentSource: value => setJsxSource(value),
  getStylesSource: () => getCssSource(),
  setStylesSource: value => setCssSource(value),
  scheduleRender: () => {
    if (
      autoRenderToggle?.checked &&
      typeof renderRuntime?.scheduleRender === 'function'
    ) {
      renderRuntime.scheduleRender()
    }
  },
  getRenderMode: () => renderMode.value,
  getStyleMode: () => styleMode.value,
  getDrawerSide: () => {
    return 'right'
  },
})

prDrawerController = createGitHubPrDrawer({
  toggleButton: githubPrToggle,
  drawer: githubPrDrawer,
  closeButton: githubPrClose,
  repositorySelect: githubPrRepoSelect,
  baseBranchInput: githubPrBaseBranch,
  headBranchInput: githubPrHeadBranch,
  componentPathInput: githubPrComponentPath,
  stylesPathInput: githubPrStylesPath,
  prTitleInput: githubPrTitle,
  prBodyInput: githubPrBody,
  commitMessageInput: githubPrCommitMessage,
  includeAppWrapperToggle: githubPrIncludeAppWrapper,
  submitButton: githubPrSubmit,
  titleNode: openPrTitle,
  statusNode: githubPrStatus,
  getToken: getCurrentGitHubToken,
  getSelectedRepository: getCurrentSelectedRepository,
  getWritableRepositories: getCurrentWritableRepositories,
  setSelectedRepository: setCurrentSelectedRepository,
  getComponentSource: () => getJsxSource(),
  getStylesSource: () => getCssSource(),
  getTopLevelDeclarations,
  getRenderMode: () => renderMode.value,
  getStyleMode: () => styleMode.value,
  getDrawerSide: () => {
    return 'right'
  },
  confirmBeforeSubmit: options => {
    confirmAction(options)
  },
  onPullRequestOpened: ({ url }) => {
    const activeContextSyncKey = getActivePrContextSyncKey(
      githubAiContextState.activePrContext,
    )
    if (
      activeContextSyncKey &&
      activeContextSyncKey === githubAiContextState.activePrEditorSyncKey
    ) {
      githubAiContextState.hasSyncedActivePrEditorContent = true
      syncEditorPrContextIndicators(true)
    }

    const message = url
      ? `Pull request opened: ${url}`
      : 'Pull request opened successfully.'
    showAppToast(message)
  },
  onPullRequestCommitPushed: ({ branch, fileUpdates }) => {
    const fileCount = Array.isArray(fileUpdates) ? fileUpdates.length : 0
    const message =
      fileCount > 0
        ? `Pushed commit to ${branch} (${fileCount} file${fileCount === 1 ? '' : 's'}).`
        : `Pushed commit to ${branch}.`
    showAppToast(message)
  },
  onActivePrContextChange: activeContext => {
    syncActivePrContextUi(activeContext)
    syncAiChatTokenVisibility(githubAiContextState.token)
  },
  onSyncActivePrEditorContent: async args => {
    const result = await prEditorSyncController.syncFromActiveContext(args)
    const syncedContextKey = getActivePrContextSyncKey(args?.activeContext)

    if (
      !syncedContextKey ||
      syncedContextKey !== githubAiContextState.activePrEditorSyncKey
    ) {
      return result
    }

    if (result?.synced === true) {
      githubAiContextState.hasSyncedActivePrEditorContent = true
      syncEditorPrContextIndicators(true)
    }

    return result
  },
  onRestoreRenderMode: mode => {
    applyRenderMode({ mode, fromActivePrContext: true })
  },
  onRestoreStyleMode: mode => {
    applyStyleMode({ mode })
  },
})

prDrawerController.setToken(githubAiContextState.token)
prDrawerController.setSelectedRepository(githubAiContextState.selectedRepository)
prDrawerController.syncRepositories()
syncActivePrContextUi(prDrawerController.getActivePrContext())

githubPrContextClose?.addEventListener('click', () => {
  if (!githubAiContextState.activePrContext) {
    return
  }

  const activePrReference = formatActivePrReference(githubAiContextState.activePrContext)
  const referenceLine = activePrReference ? `PR: ${activePrReference}\n` : ''

  confirmAction({
    title: 'Close pull request on GitHub?',
    copy: `${referenceLine}PR title: ${githubAiContextState.activePrContext.prTitle}\nHead branch: ${githubAiContextState.activePrContext.headBranch}\n\nThis will close the pull request on GitHub and clear the active pull request context for the selected repository.`,
    confirmButtonText: 'Close PR on GitHub',
    onConfirm: () => {
      void prDrawerController
        .closeActivePullRequestOnGitHub()
        .then(result => {
          const reference = result?.reference
          setStatus(
            reference
              ? `Closed pull request on GitHub and cleared active context (${reference}).`
              : 'Closed pull request on GitHub and cleared active context.',
            'neutral',
          )
          showAppToast(
            reference
              ? `Closed pull request on GitHub and cleared active context (${reference}).`
              : 'Closed pull request on GitHub and cleared active context.',
          )
        })
        .catch(error => {
          const message =
            error instanceof Error
              ? error.message
              : 'Could not close pull request context on GitHub.'
          setStatus(`Close context failed: ${message}`, 'error')
          showAppToast(`Close context failed: ${message}`)
        })
    },
  })
})

githubPrContextDisconnect?.addEventListener('click', () => {
  if (!githubAiContextState.activePrContext) {
    return
  }

  const activePrReference = formatActivePrReference(githubAiContextState.activePrContext)
  const referenceLine = activePrReference ? `PR: ${activePrReference}\n` : ''

  confirmAction({
    title: 'Disconnect PR context?',
    copy: `${referenceLine}This will disconnect the active pull request context in this app only.\nYour pull request will stay open on GitHub.\nYour GitHub token and selected repository will stay connected.`,
    confirmButtonText: 'Disconnect',
    onConfirm: () => {
      const result = prDrawerController.disconnectActivePrContext()
      const reference = result?.reference
      setStatus(
        reference
          ? `Disconnected PR context (${reference}). Pull request remains open on GitHub.`
          : 'Disconnected PR context. Pull request remains open on GitHub.',
        'neutral',
      )
    },
  })
})

const getStyleEditorLanguage = mode => {
  if (mode === 'less') return 'less'
  if (mode === 'sass') return 'sass'
  return 'css'
}

const normalizeRenderMode = mode => (mode === 'react' ? 'react' : 'dom')

const normalizeStyleMode = mode => {
  if (mode === 'module') return 'module'
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
        value: getJsxSource(),
        language: 'javascript-jsx',
        contentAttributes: {
          'aria-label': 'Component source editor',
          'aria-multiline': 'true',
        },
        onChange: () => {
          if (suppressEditorChangeSideEffects) {
            return
          }
          const activeTab = getActiveWorkspaceTab()
          if (activeTab && getTabKind(activeTab) === 'component') {
            workspaceTabsState.upsertTab(
              {
                ...activeTab,
                content: getJsxSource(),
                lastModified: Date.now(),
                isActive: true,
              },
              { emitReason: 'componentEditorChange' },
            )
          }
          queueWorkspaceSave()
          maybeRenderFromComponentEditorChange()
          markTypeDiagnosticsStale()
          markComponentLintDiagnosticsStale()
        },
      }),
      createCodeMirrorEditor({
        parent: cssHost,
        value: getCssSource(),
        language: getStyleEditorLanguage(styleMode.value),
        contentAttributes: {
          'aria-label': 'Styles source editor',
          'aria-multiline': 'true',
        },
        onChange: () => {
          if (suppressEditorChangeSideEffects) {
            return
          }
          const activeTab = getActiveWorkspaceTab()
          if (activeTab && getTabKind(activeTab) === 'styles') {
            workspaceTabsState.upsertTab(
              {
                ...activeTab,
                content: getCssSource(),
                lastModified: Date.now(),
                isActive: true,
              },
              { emitReason: 'stylesEditorChange' },
            )
          }
          queueWorkspaceSave()
          maybeRender()
          markStylesLintDiagnosticsStale()
        },
      }),
    ])

    jsxHost.addEventListener('focusout', event => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !jsxHost.contains(event.relatedTarget)
      ) {
        void flushWorkspaceSave().catch(() => {
          /* Save failures are already surfaced through saver onError. */
        })
      }
    })

    cssHost.addEventListener('focusout', event => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !cssHost.contains(event.relatedTarget)
      ) {
        void flushWorkspaceSave().catch(() => {
          /* Save failures are already surfaced through saver onError. */
        })
      }
    })

    jsxCodeEditor = nextJsxEditor
    cssCodeEditor = nextCssEditor
    getJsxSource = () => jsxCodeEditor.getValue()
    getCssSource = () => cssCodeEditor.getValue()

    editorPool.register('component', {
      isMounted: () =>
        componentEditorPanel instanceof HTMLElement &&
        !componentEditorPanel.hasAttribute('hidden'),
      mount: () => {
        componentEditorPanel?.removeAttribute('hidden')
      },
      unmount: () => {
        componentEditorPanel?.setAttribute('hidden', '')
      },
    })
    editorPool.register('styles', {
      isMounted: () =>
        stylesEditorPanel instanceof HTMLElement &&
        !stylesEditorPanel.hasAttribute('hidden'),
      mount: () => {
        stylesEditorPanel?.removeAttribute('hidden')
      },
      unmount: () => {
        stylesEditorPanel?.setAttribute('hidden', '')
      },
    })

    const activeWorkspaceTab = getActiveWorkspaceTab()
    if (activeWorkspaceTab) {
      loadWorkspaceTabIntoEditor(activeWorkspaceTab)
    }

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

const maybeRenderFromComponentEditorChange = () => {
  if (!autoRenderToggle.checked) {
    return
  }

  const activeTab = getActiveWorkspaceTab()
  if (activeTab && getTabKind(activeTab) === 'component') {
    const shouldRender = renderRuntime.shouldAutoRenderForTabChange(activeTab.id)
    if (!shouldRender) {
      return
    }
  }

  renderRuntime.scheduleRender()
}

renderRuntime = createRenderRuntimeController({
  cdnImports,
  importFromCdnWithFallback,
  renderMode,
  styleMode,
  isAutoRenderEnabled: () => autoRenderToggle.checked,
  getCssSource: () => getPreviewStylesSource(),
  getJsxSource: () => getJsxSource(),
  getWorkspaceTabs: () => buildWorkspaceTabsSnapshot(),
  getPreviewHost: () => previewHost,
  getPreviewBackgroundColor: () => previewBackground.getPreviewBackgroundColor(),
  clearStyleDiagnostics: () => clearDiagnosticsScope('styles'),
  setStyleDiagnosticsDetails,
  setStatus,
  setRenderedStatus,
  onFirstRenderComplete: () => {},
  setCdnLoading,
})

function setJsxSource(value) {
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

function setCssSource(value) {
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

  pendingClearAction = onConfirm
  clearConfirmDialog.showModal()
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

const initializePreviewBackgroundPicker = () => {
  previewBackground.initializePreviewBackgroundPicker()
}

const updateRenderButtonVisibility = () => {
  renderButton.hidden = autoRenderToggle.checked
}

function applyRenderMode({ mode, fromActivePrContext: _fromActivePrContext = false }) {
  const nextMode = normalizeRenderMode(mode)

  if (renderMode.value !== nextMode) {
    renderMode.value = nextMode
  }

  resetDiagnosticsFlow()

  maybeRender()
  void flushWorkspaceSave().catch(() => {
    /* Save failures are already surfaced through saver onError. */
  })
}

function applyStyleMode({ mode }) {
  const nextMode = normalizeStyleMode(mode)

  if (styleMode.value !== nextMode) {
    styleMode.value = nextMode
  }

  resetDiagnosticsFlow()

  if (cssCodeEditor) {
    suppressEditorChangeSideEffects = true
    try {
      cssCodeEditor.setLanguage(getStyleEditorLanguage(nextMode))
    } finally {
      suppressEditorChangeSideEffects = false
    }
  }

  maybeRender()
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

if (githubPrLocalContextSelect instanceof HTMLSelectElement) {
  githubPrLocalContextSelect.addEventListener('change', () => {
    const selectedId = githubPrLocalContextSelect.value
    updateLocalContextActions()

    if (!selectedId) {
      return
    }

    void workspaceStorage
      .getWorkspaceById(selectedId)
      .then(record => {
        if (!record) {
          return refreshLocalContextOptions()
        }

        return applyWorkspaceRecord(record, { silent: false })
      })
      .catch(() => {
        setStatus('Could not load selected local context.', 'error')
      })
  })
}

for (const element of [
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrComponentPath,
  githubPrStylesPath,
  githubPrTitle,
]) {
  bindWorkspaceMetadataPersistence(element)
}

for (const element of [githubPrComponentPath, githubPrStylesPath]) {
  if (!(element instanceof HTMLInputElement)) {
    continue
  }

  const handler = () => {
    syncTabPathsFromInputs()
  }

  element.addEventListener('input', handler)
  element.addEventListener('change', handler)
  element.addEventListener('blur', handler)
}

if (githubPrLocalContextRemove instanceof HTMLButtonElement) {
  githubPrLocalContextRemove.addEventListener('click', () => {
    const selectedId =
      githubPrLocalContextSelect instanceof HTMLSelectElement
        ? githubPrLocalContextSelect.value
        : ''

    if (!selectedId) {
      return
    }

    confirmAction({
      title: 'Remove stored local context?',
      copy: 'This removes only local workspace metadata and editor content from this browser.',
      confirmButtonText: 'Remove',
      onConfirm: () => {
        void workspaceStorage
          .removeWorkspace(selectedId)
          .then(async () => {
            if (activeWorkspaceRecordId === selectedId) {
              activeWorkspaceRecordId = ''
              activeWorkspaceCreatedAt = null
            }

            await refreshLocalContextOptions()
            setStatus('Removed stored local context.', 'neutral')
          })
          .catch(() => {
            setStatus('Could not remove stored local context.', 'error')
          })
      },
    })
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

if (aiControlsToggle instanceof HTMLButtonElement) {
  aiControlsToggle.addEventListener('click', () => {
    if (!isCompactViewport()) {
      return
    }

    setCompactAiControlsOpen(!compactAiControlsOpen)
  })
}

if (githubTokenInfo instanceof HTMLButtonElement && githubTokenInfoPanel) {
  githubTokenInfo.addEventListener('click', event => {
    event.preventDefault()
    setGitHubTokenInfoOpen(!githubTokenInfoOpen)
  })
}

document.addEventListener('click', event => {
  const clickTarget = event.target
  if (!(clickTarget instanceof Node)) {
    return
  }

  if (isCompactViewport() && compactAiControlsOpen) {
    if (
      !githubAiControls.contains(clickTarget) &&
      !aiControlsToggle?.contains(clickTarget)
    ) {
      setCompactAiControlsOpen(false)
    }
  }

  if (githubTokenInfoOpen) {
    if (
      !githubTokenInfo?.contains(clickTarget) &&
      !githubTokenInfoPanel?.contains(clickTarget)
    ) {
      setGitHubTokenInfoOpen(false)
    }
  }
})

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') {
    return
  }

  setCompactAiControlsOpen(false)
  setGitHubTokenInfoOpen(false)
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
  setCompactAiControlsOpen(false)
}

if (typeof compactViewportMediaQuery.addEventListener === 'function') {
  compactViewportMediaQuery.addEventListener('change', handleCompactViewportChange)
} else {
  compactViewportMediaQuery.onchange = handleCompactViewportChange
}

window.addEventListener('beforeunload', () => {
  if (appToastDismissTimer) {
    clearTimeout(appToastDismissTimer)
    appToastDismissTimer = null
  }
  clearComponentLintRecheckTimer()
  clearStylesLintRecheckTimer()
  lintDiagnostics.dispose()
  void flushWorkspaceSave().catch(() => {
    /* noop */
  })
  workspaceSaver?.dispose()
  void workspaceStorage.close()
  chatDrawerController.dispose()
  prDrawerController.dispose()
})

applyTheme(getInitialTheme(), { persist: false })
applyEditorToolsVisibility()
applyPanelCollapseState()
syncHeaderLabels()
renderWorkspaceTabs()
setCompactAiControlsOpen(false)
setGitHubTokenInfoOpen(false)
syncAiChatTokenVisibility(githubAiContextState.token)

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
    workspaceTabsState.getTab(loadedStylesTabId) ?? getWorkspaceTabByKind('styles')
  if (stylesTab && typeof stylesTab.content === 'string') {
    setCssSource(stylesTab.content)
  }

  hasCompletedInitialWorkspaceBootstrap = true
  await renderPreview()
})
