import {
  cdnImports,
  getTypePackageFileUrls,
  getTypeScriptLibUrls,
  importFromCdnWithFallback,
} from './modules/cdn.js'
import { createCodeMirrorEditor } from './modules/editor/editor-codemirror.js'
import { createCompactAiControlsUiController } from './modules/app-core/compact-ai-controls-ui.js'
import { bindAppEventsAndStart } from './modules/app-core/app-bindings-startup.js'
import {
  createEditorBootstrapOptions,
  createRuntimeCoreOptions,
} from './modules/app-core/app-composition-options.js'
import { createDiagnosticsFlowController } from './modules/app-core/diagnostics-flow-controller.js'
import { createEditorBootstrapController } from './modules/app-core/editor-bootstrap-controller.js'
import {
  getInitialRenderMode as getInitialRenderModeValue,
  getStyleEditorLanguage,
  normalizeRenderMode,
  normalizeStyleMode,
  persistRenderMode as persistRenderModeValue,
  setCssSourceValue,
  setJsxSourceValue,
  updateRenderModeEditability as updateRenderModeEditabilityValue,
} from './modules/app-core/runtime-editor-utils.js'
import { createRuntimeCoreSetup } from './modules/app-core/runtime-core-setup.js'
import {
  createWorkspaceContextSnapshotGetter,
  toStyleModeForTabLanguage,
} from './modules/app-core/workspace-local-helpers.js'
import { createWorkspaceEditorHelpers } from './modules/app-core/workspace-editor-helpers.js'
import { createLayoutDiagnosticsSetup } from './modules/app-core/layout-diagnostics-setup.js'
import { createWorkspaceControllersSetup } from './modules/app-core/workspace-controllers-setup.js'
import { createGitHubWorkflowsSetup } from './modules/app-core/github-workflows-setup.js'
import { defaultCss, defaultJsx } from './modules/app-core/defaults.js'
import { createGitHubPrContextUiController } from './modules/app-core/github-pr-context-ui.js'
import { createGitHubTokenInfoUiController } from './modules/app-core/github-token-info-ui.js'
import { createWorkspaceSyncController } from './modules/app-core/workspace-sync-controller.js'
import { createWorkspaceTabAddMenuUiController } from './modules/app-core/workspace-tab-add-menu-ui.js'
import { createDiagnosticsUiController } from './modules/diagnostics/diagnostics-ui.js'
import { createGitHubChatDrawer } from './modules/github/chat-drawer/drawer.js'
import { createGitHubByotControls } from './modules/github/github-byot-controls.js'
import {
  formatActivePrReference,
  getActivePrContextSyncKey,
} from './modules/github/github-pr-context.js'
import { createGitHubPrEditorSyncController } from './modules/github/github-pr-editor-sync.js'
import { createGitHubPrDrawer } from './modules/github/github-pr-drawer.js'
import { createLayoutThemeController } from './modules/ui/layout-theme.js'
import { createLintDiagnosticsController } from './modules/diagnostics/lint-diagnostics.js'
import { createPreviewBackgroundController } from './modules/preview/preview-background.js'
import { createRenderRuntimeController } from './modules/preview/render-runtime.js'
import { createTypeDiagnosticsController } from './modules/diagnostics/type-diagnostics.js'
import { collectTopLevelDeclarations } from './modules/preview/jsx-top-level-declarations.js'
import { ensureJsxTransformSource } from './modules/preview/jsx-transform-runtime.js'
import { createEditorPoolManager } from './modules/editor/editor-pool-manager.js'
import { createWorkspaceTabsState } from './modules/workspace/workspace-tabs-state.js'
import { createWorkspacesDrawer } from './modules/workspace/workspaces-drawer/drawer.js'
import {
  createDebouncedWorkspaceSaver,
  createWorkspaceStorageAdapter,
} from './modules/workspace/workspace-storage.js'
import {
  createWorkspaceTabId as createWorkspaceTabIdFactory,
  makeUniqueTabPath as makeUniqueTabPathFactory,
} from './modules/workspace/workspace-tab-factory.js'
import { createEnsureWorkspaceTabsShape } from './modules/workspace/workspace-tab-shape.js'
import {
  getDirtyStateForTabChange,
  getPathFileName,
  getTabKind,
  getTabTargetPrFilePath,
  getWorkspaceTabDisplay,
  hasTabCommittedSyncState,
  isStyleTabLanguage,
  normalizeEntryTabPath,
  normalizeModuleTabPathForRename,
  normalizeWorkspacePathValue,
  resolveSyncedBaselineContent,
  resolveWorkspaceActiveTabId,
  resolveWorkspaceRecordIdentity,
  toNonEmptyWorkspaceText,
  toWorkspaceRecordId,
  toWorkspaceSyncSha,
  toWorkspaceSyncedContent,
  toWorkspaceSyncTimestamp,
} from './modules/workspace/workspace-tab-helpers.js'

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
const githubPrTitle = document.getElementById('github-pr-title')
const githubPrBody = document.getElementById('github-pr-body')
const githubPrCommitMessage = document.getElementById('github-pr-commit-message')
const githubPrIncludeAppWrapper = document.getElementById('github-pr-include-app-wrapper')
const githubPrSubmit = document.getElementById('github-pr-submit')
const workspacesToggle = document.getElementById('workspaces-toggle')
const workspacesDrawer = document.getElementById('workspaces-drawer')
const workspacesClose = document.getElementById('workspaces-close')
const workspacesStatus = document.getElementById('workspaces-status')
const workspacesSearch = document.getElementById('workspaces-search')
const workspacesSelect = document.getElementById('workspaces-select')
const workspacesOpen = document.getElementById('workspaces-open')
const workspacesRemove = document.getElementById('workspaces-remove')
const componentPrSyncIcon = document.getElementById('component-pr-sync-icon')
const componentPrSyncIconPath = document.getElementById('component-pr-sync-icon-path')
const stylesPrSyncIcon = document.getElementById('styles-pr-sync-icon')
const stylesPrSyncIconPath = document.getElementById('styles-pr-sync-icon-path')
const componentEditorHeaderLabel = document.querySelector(
  '#editor-header-component [data-editor-header-label]',
)
const stylesEditorHeaderLabel = document.querySelector(
  '#editor-header-styles [data-editor-header-label]',
)
const componentEditorDirtyStatus = document.getElementById('component-dirty-status')
const stylesEditorDirtyStatus = document.getElementById('styles-dirty-status')
const aiControlsToggle = document.getElementById('ai-controls-toggle')
const appThemeButtons = document.querySelectorAll('[data-app-theme]')
const workspaceTabsShell = document.getElementById('workspace-tabs-shell')
const workspaceTabsStrip = document.getElementById('workspace-tabs-strip')
const workspaceTabAddWrap = document.getElementById('workspace-tab-add-wrap')
const workspaceTabAddButton = document.getElementById('workspace-tab-add')
const workspaceTabAddMenu = document.getElementById('workspace-tab-add-menu')
const workspaceTabAddModule = document.getElementById('workspace-tab-add-module')
const workspaceTabAddStyles = document.getElementById('workspace-tab-add-styles')
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
const allowedEntryTabFileNames = new Set(['app.tsx', 'app.js'])
const renderModeStorageKey = 'knighted-develop:render-mode'
const editorKinds = ['component', 'styles']
const editorPanelsByKind = {
  component: componentEditorPanel,
  styles: stylesEditorPanel,
}
const editorHeaderLabelByKind = {
  component: componentEditorHeaderLabel,
  styles: stylesEditorHeaderLabel,
}
const editorHeaderDirtyStatusByKind = {
  component: componentEditorDirtyStatus,
  styles: stylesEditorDirtyStatus,
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
let activeWorkspaceRecordId = ''
let activeWorkspaceCreatedAt = null
let workspacesDrawerController = null
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
let draggedWorkspaceTabId = ''
let dragOverWorkspaceTabId = ''
let suppressWorkspaceTabClick = false
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
  onBackgroundColorChange: color => {
    if (
      renderRuntime &&
      typeof renderRuntime.updatePreviewBackgroundColor === 'function'
    ) {
      renderRuntime.updatePreviewBackgroundColor(color)
    }
  },
  getDefaultPreviewBackgroundColor: () => {
    if (document.documentElement.dataset.theme === 'light') {
      return '#ffffff'
    }

    if (componentEditorPanel instanceof HTMLElement) {
      return getComputedStyle(componentEditorPanel).backgroundColor
    }

    return ''
  },
})

const layoutTheme = createLayoutThemeController({
  appThemeButtons,
  syncPreviewBackgroundPickerFromTheme: () =>
    previewBackground.syncPreviewBackgroundPickerFromTheme(),
})

const { applyTheme, getInitialTheme } = layoutTheme

const githubTokenInfoUi = createGitHubTokenInfoUiController({
  tokenInfoButton: githubTokenInfo,
  tokenInfoPanel: githubTokenInfoPanel,
})
const compactAiControlsUi = createCompactAiControlsUiController({
  toggleButton: aiControlsToggle,
  controlsRoot: githubAiControls,
  closeTokenInfo: () => githubTokenInfoUi.close(),
})
const workspaceTabAddMenuUi = createWorkspaceTabAddMenuUiController({
  addButton: workspaceTabAddButton,
  addMenu: workspaceTabAddMenu,
  addModuleButton: workspaceTabAddModule,
})

const {
  panelToolsState,
  applyEditorToolsVisibility,
  applyPanelCollapseState,
  togglePanelCollapse,
  diagnosticsUi,
} = createLayoutDiagnosticsSetup({
  compactAiControlsUi,
  appGrid,
  previewPanel,
  componentEditorPanel,
  stylesEditorPanel,
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
  getJsxCodeEditor: () => jsxCodeEditor,
  getCssCodeEditor: () => cssCodeEditor,
  jsxEditor,
  cssEditor,
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
  setDiagnosticsDrawerOpen,
  setLintDiagnosticsPending,
  setTypeDiagnosticsPending,
  setStatus,
  setStyleDiagnosticsDetails,
  setTypeDiagnosticsDetails,
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

const prContextUi = createGitHubPrContextUiController({
  contextState: githubAiContextState,
  getActivePrContextSyncKey,
  githubPrToggle,
  githubPrToggleLabel,
  githubPrToggleIcon,
  githubPrToggleIconPath,
  componentPrSyncIcon,
  componentPrSyncIconPath,
  stylesPrSyncIcon,
  stylesPrSyncIconPath,
  githubPrContextClose,
  githubPrContextDisconnect,
  aiChatToggle,
  workspacesToggle,
  githubPrOpenIcon,
  githubPrPushCommitIcon,
  closeChatDrawer: () => {
    chatDrawerController.setOpen(false)
  },
  closePrDrawer: () => {
    prDrawerController.setOpen(false)
  },
  closeWorkspacesDrawer: () => workspacesDrawerController?.setOpen(false),
})

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
    prContextUi.syncAiChatTokenVisibility(token)
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

const getWorkspaceContextSnapshot = createWorkspaceContextSnapshotGetter({
  getCurrentSelectedRepository,
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrTitle,
})

let loadedComponentTabId = 'component'
let loadedStylesTabId = 'styles'

const getActiveWorkspaceTab = () =>
  workspaceTabsState.getTab(workspaceTabsState.getActiveTabId())

const {
  getWorkspaceTabByKind,
  syncHeaderLabels,
  persistActiveTabEditorContent,
  loadWorkspaceTabIntoEditor,
} = createWorkspaceEditorHelpers({
  workspaceTabsState,
  getTabKind,
  editorKinds,
  editorPanelsByKind,
  editorHeaderLabelByKind,
  editorHeaderDirtyStatusByKind,
  defaultTabNameByKind,
  toNonEmptyWorkspaceText,
  getLoadedStylesTabId: () => loadedStylesTabId,
  getLoadedComponentTabId: () => loadedComponentTabId,
  setLoadedStylesTabId: value => (loadedStylesTabId = value),
  setLoadedComponentTabId: value => (loadedComponentTabId = value),
  getCssSource: () => getCssSource(),
  getJsxSource: () => getJsxSource(),
  getDirtyStateForTabChange,
  setCssSource,
  setJsxSource,
  styleMode,
  toStyleModeForTabLanguage,
  getStyleEditorLanguage,
  getCssCodeEditor: () => cssCodeEditor,
  setSuppressEditorChangeSideEffects: value => (suppressEditorChangeSideEffects = value),
  editorPool,
})

const workspaceSyncController = createWorkspaceSyncController({
  workspaceTabsState,
  getTabKind,
  getTabTargetPrFilePath,
  normalizeWorkspacePathValue,
  toWorkspaceSyncedContent,
  toWorkspaceSyncSha,
  toNonEmptyWorkspaceText,
  hasTabCommittedSyncState,
  getJsxSource: () => getJsxSource(),
  getCssSource: () => getCssSource(),
  getWorkspaceTabByKind,
  queueWorkspaceSave: () => queueWorkspaceSave(),
  resolveWorkspaceRecordIdentity,
  getWorkspaceContextSnapshot,
  getActiveWorkspaceRecordId: () => activeWorkspaceRecordId,
  getActiveWorkspaceCreatedAt: () => activeWorkspaceCreatedAt,
  getRenderModeValue: () => renderMode.value,
  normalizeRenderMode: mode => normalizeRenderMode(mode),
})

const getLoadedComponentWorkspaceTab = () =>
  workspaceTabsState.getTab(loadedComponentTabId) ?? getWorkspaceTabByKind('component')

const getTypecheckSourcePath = () => {
  const loadedComponentTab = getLoadedComponentWorkspaceTab()
  return toNonEmptyWorkspaceText(loadedComponentTab?.path) || defaultComponentTabPath
}

const createWorkspaceTabId = prefix => createWorkspaceTabIdFactory(prefix)

const makeUniqueTabPath = ({ basePath, suffix = '' }) =>
  makeUniqueTabPathFactory({
    basePath,
    suffix,
    tabs: workspaceTabsState.getTabs(),
    toNonEmptyWorkspaceText,
  })

const ensureWorkspaceTabsShape = createEnsureWorkspaceTabsShape({
  defaultComponentTabName,
  defaultComponentTabPath,
  defaultStylesTabName,
  defaultStylesTabPath,
  defaultJsx,
  normalizeEntryTabPath,
  getPathFileName,
  getTabTargetPrFilePath,
  normalizeWorkspacePathValue,
  toWorkspaceSyncTimestamp,
  toWorkspaceSyncSha,
  resolveSyncedBaselineContent,
  toNonEmptyWorkspaceText,
  isStyleTabLanguage,
})

const buildWorkspaceTabsSnapshot = () =>
  workspaceSyncController.buildWorkspaceTabsSnapshot()

const reconcileWorkspaceTabsWithPushUpdates = fileUpdates =>
  workspaceSyncController.reconcileWorkspaceTabsWithPushUpdates(fileUpdates)

const getWorkspacePrFileCommits = () =>
  workspaceSyncController.getWorkspacePrFileCommits()

const getEditorSyncTargets = () => workspaceSyncController.getEditorSyncTargets()

const reconcileWorkspaceTabsWithEditorSync = ({ tabTargets } = {}) =>
  workspaceSyncController.reconcileWorkspaceTabsWithEditorSync({ tabTargets })

const buildWorkspaceRecordSnapshot = ({ recordId } = {}) =>
  workspaceSyncController.buildWorkspaceRecordSnapshot({ recordId })

const {
  workspaceSaveController,
  listLocalContextRecords,
  refreshLocalContextOptions,
  applyWorkspaceRecord,
  queueWorkspaceSave,
  flushWorkspaceSave,
  setActiveWorkspaceTab,
  addWorkspaceTab,
  renderWorkspaceTabs,
  loadPreferredWorkspaceContext,
  bindWorkspaceMetadataPersistence,
} = createWorkspaceControllersSetup({
  createDebouncedWorkspaceSaver,
  workspaceStorage,
  getWorkspacesDrawerController: () => workspacesDrawerController,
  toNonEmptyWorkspaceText,
  buildWorkspaceRecordSnapshot,
  setStatus,
  getIsApplyingWorkspaceSnapshot: () => isApplyingWorkspaceSnapshot,
  getActiveWorkspaceCreatedAt: () => activeWorkspaceCreatedAt,
  setActiveWorkspaceRecordId: value => (activeWorkspaceRecordId = value),
  setActiveWorkspaceCreatedAt: value => (activeWorkspaceCreatedAt = value),
  getCurrentSelectedRepository,
  getActiveWorkspaceRecordId: () => activeWorkspaceRecordId,
  setIsApplyingWorkspaceSnapshot: value => (isApplyingWorkspaceSnapshot = value),
  ensureWorkspaceTabsShape,
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrTitle,
  workspaceTabsState,
  resolveWorkspaceActiveTabId,
  normalizeRenderMode: mode => normalizeRenderMode(mode),
  getRenderModeValue: () => renderMode.value,
  setRenderModeValue: value => {
    renderMode.value = value
  },
  persistRenderMode: mode => persistRenderMode(mode),
  getActiveWorkspaceTab,
  loadWorkspaceTabIntoEditor,
  updateRenderModeEditability: () => updateRenderModeEditability(),
  getHasCompletedInitialWorkspaceBootstrap: () => hasCompletedInitialWorkspaceBootstrap,
  maybeRender: () => maybeRender(),
  toWorkspaceRecordId,
  workspaceTabsStrip,
  getWorkspaceTabRenameState: () => workspaceTabRenameState,
  getDraggedWorkspaceTabId: () => draggedWorkspaceTabId,
  setDraggedWorkspaceTabId: value => (draggedWorkspaceTabId = value),
  getDragOverWorkspaceTabId: () => dragOverWorkspaceTabId,
  setDragOverWorkspaceTabId: value => (dragOverWorkspaceTabId = value),
  getSuppressWorkspaceTabClick: () => suppressWorkspaceTabClick,
  setSuppressWorkspaceTabClick: value => (suppressWorkspaceTabClick = value),
  getIsRenderingWorkspaceTabs: () => isRenderingWorkspaceTabs,
  setIsRenderingWorkspaceTabs: value => (isRenderingWorkspaceTabs = value),
  getHasPendingWorkspaceTabsRender: () => hasPendingWorkspaceTabsRender,
  setHasPendingWorkspaceTabsRender: value => (hasPendingWorkspaceTabsRender = value),
  persistActiveTabEditorContent,
  getWorkspaceTabDisplay,
  workspaceTabsShell,
  workspaceTabAddWrap,
  setWorkspaceTabRenameState: value => (workspaceTabRenameState = value),
  allowedEntryTabFileNames,
  getPathFileName,
  normalizeEntryTabPath,
  normalizeModuleTabPathForRename,
  defaultComponentTabName,
  getDirtyStateForTabChange,
  syncHeaderLabels,
  setWorkspaceTabAddMenuOpen: isOpen => {
    workspaceTabAddMenuUi.setOpen(isOpen)
  },
  confirmAction: options => confirmAction(options),
  getTabKind,
  getLoadedComponentTabId: () => loadedComponentTabId,
  setLoadedComponentTabId: value => (loadedComponentTabId = value),
  getLoadedStylesTabId: () => loadedStylesTabId,
  setLoadedStylesTabId: value => (loadedStylesTabId = value),
  getWorkspaceTabByKind,
  makeUniqueTabPath,
  createWorkspaceTabId,
})

const githubWorkflows = createGitHubWorkflowsSetup({
  factories: {
    createGitHubPrEditorSyncController,
    createGitHubChatDrawer,
    createGitHubPrDrawer,
    createWorkspacesDrawer,
  },
  platform: {
    ensureJsxTransformSource,
    collectTopLevelDeclarations,
    cdnImports,
    importFromCdnWithFallback,
  },
  state: {
    githubAiContextState,
  },
  byot: {
    byotControls,
    getCurrentGitHubToken,
    getCurrentSelectedRepository,
    setCurrentSelectedRepository: fullName =>
      byotControls.setSelectedRepository(fullName),
  },
  ui: {
    aiChatToggle,
    aiChatDrawer,
    aiChatClose,
    aiChatPrompt,
    aiChatModel,
    aiChatIncludeEditors,
    aiChatSend,
    aiChatClear,
    aiChatStatus,
    aiChatRepository,
    aiChatMessages,
    githubPrToggle,
    githubPrDrawer,
    githubPrClose,
    githubPrRepoSelect,
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    githubPrBody,
    githubPrCommitMessage,
    githubPrIncludeAppWrapper,
    githubPrSubmit,
    openPrTitle,
    githubPrStatus,
    workspacesToggle,
    workspacesDrawer,
    workspacesClose,
    workspacesStatus,
    workspacesSearch,
    workspacesSelect,
    workspacesOpen,
    workspacesRemove,
  },
  workspace: {
    workspaceStorage,
    getActiveWorkspaceRecordId: () => activeWorkspaceRecordId,
    setActiveWorkspaceRecordId: value => (activeWorkspaceRecordId = value),
    setActiveWorkspaceCreatedAt: value => (activeWorkspaceCreatedAt = value),
    listLocalContextRecords,
    refreshLocalContextOptions,
    applyWorkspaceRecord,
    getWorkspacePrFileCommits,
    getEditorSyncTargets,
    reconcileWorkspaceTabsWithPushUpdates,
  },
  runtime: {
    getRenderMode: () => renderMode.value,
    getStyleMode: () => styleMode.value,
    getActivePrContextSyncKey,
    prContextUi,
    getTokenForVisibility: () => githubAiContextState.token,
    closeWorkspacesDrawer: () => {
      void workspacesDrawerController?.setOpen(false)
    },
    getActivePrEditorSyncKey: () => githubAiContextState.activePrEditorSyncKey,
    syncFromActiveContext: ({ tabTargets }) => {
      reconcileWorkspaceTabsWithEditorSync({ tabTargets })
    },
    formatActivePrReference,
    githubPrContextClose,
    githubPrContextDisconnect,
  },
  actions: {
    applyRenderMode,
    applyStyleMode,
    confirmAction: options => confirmAction(options),
    setStatus,
    showAppToast,
    setComponentSource: value => {
      suppressEditorChangeSideEffects = true
      try {
        setJsxSource(value)
      } finally {
        suppressEditorChangeSideEffects = false
      }
    },
    setStylesSource: value => {
      suppressEditorChangeSideEffects = true
      try {
        setCssSource(value)
      } finally {
        suppressEditorChangeSideEffects = false
      }
    },
    getComponentSource: () => getJsxSource(),
    getStylesSource: () => getCssSource(),
    scheduleRender: () => {
      if (
        autoRenderToggle?.checked &&
        typeof renderRuntime?.scheduleRender === 'function'
      ) {
        renderRuntime.scheduleRender()
      }
    },
  },
})

chatDrawerController = githubWorkflows.chatDrawerController
prDrawerController = githubWorkflows.prDrawerController
workspacesDrawerController = githubWorkflows.workspacesDrawerController

const persistRenderMode = mode => persistRenderModeValue(mode, { renderModeStorageKey })

const getInitialRenderMode = () => getInitialRenderModeValue({ renderModeStorageKey })

const updateRenderModeEditability = () =>
  updateRenderModeEditabilityValue({ renderMode, getActiveWorkspaceTab })

const editorBootstrapOptions = createEditorBootstrapOptions({
  createCodeMirrorEditor,
  jsxEditor,
  cssEditor,
  getJsxSource: () => getJsxSource(),
  getCssSource: () => getCssSource(),
  getStyleEditorLanguage,
  styleMode,
  getSuppressEditorChangeSideEffects: () => suppressEditorChangeSideEffects,
  getActiveWorkspaceTab,
  getTabKind,
  getDirtyStateForTabChange,
  workspaceTabsState,
  toWorkspaceSyncedContent,
  renderWorkspaceTabs,
  queueWorkspaceSave,
  maybeRenderFromComponentEditorChange: () => maybeRenderFromComponentEditorChange(),
  markTypeDiagnosticsStale: () => markTypeDiagnosticsStale(),
  markComponentLintDiagnosticsStale: () => markComponentLintDiagnosticsStale(),
  maybeRender: () => maybeRender(),
  markStylesLintDiagnosticsStale: () => markStylesLintDiagnosticsStale(),
  flushWorkspaceSave,
  setJsxCodeEditor: value => (jsxCodeEditor = value),
  setCssCodeEditor: value => (cssCodeEditor = value),
  setGetJsxSource: value => (getJsxSource = value),
  setGetCssSource: value => (getCssSource = value),
  editorPool,
  componentEditorPanel,
  stylesEditorPanel,
  loadWorkspaceTabIntoEditor,
  setStatus,
})
const editorBootstrapController = createEditorBootstrapController(editorBootstrapOptions)

const initializeCodeEditors = async () =>
  editorBootstrapController.initializeCodeEditors()

const runtimeCoreOptions = createRuntimeCoreOptions({
  createDiagnosticsFlowController,
  createRenderRuntimeController,
  createTypeDiagnosticsController,
  createLintDiagnosticsController,
  cdnImports,
  importFromCdnWithFallback,
  getTypeScriptLibUrls,
  getTypePackageFileUrls,
  getJsxSource: () => getJsxSource(),
  getCssSource: () => getCssSource(),
  getTypecheckSourcePath,
  buildWorkspaceTabsSnapshot,
  renderMode,
  styleMode,
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
  getRenderRuntime: () => renderRuntime,
  getPreviewHost: () => previewHost,
  previewBackground,
  clearDiagnosticsScope,
  clearConfirmDialog,
  clearConfirmTitle,
  clearConfirmCopy,
  clearConfirmButton,
  setPendingClearAction: value => (pendingClearAction = value),
  normalizeRenderMode,
  normalizeStyleMode,
  persistRenderMode,
  resetDiagnosticsFlow: () => diagnosticsFlowController.resetDiagnosticsFlow(),
  maybeRender: () => diagnosticsFlowController.maybeRender(),
  flushWorkspaceSave,
  getCssCodeEditor: () => cssCodeEditor,
  setSuppressEditorChangeSideEffects: value => (suppressEditorChangeSideEffects = value),
  getStyleEditorLanguage,
  workspaceTabsState,
  queueWorkspaceSave,
})
const runtimeCore = createRuntimeCoreSetup(runtimeCoreOptions)

const diagnosticsFlowController = runtimeCore.diagnosticsFlowController
renderRuntime = runtimeCore.renderRuntime
const setCdnLoading = runtimeCore.setCdnLoading
const typeDiagnostics = diagnosticsFlowController.typeDiagnostics
const runComponentLint = options => diagnosticsFlowController.runComponentLint(options)
const runStylesLint = options => diagnosticsFlowController.runStylesLint(options)
const markTypeDiagnosticsStale = () =>
  diagnosticsFlowController.markTypeDiagnosticsStale()
const markComponentLintDiagnosticsStale = () =>
  diagnosticsFlowController.markComponentLintDiagnosticsStale()
const markStylesLintDiagnosticsStale = () =>
  diagnosticsFlowController.markStylesLintDiagnosticsStale()
const clearComponentLintDiagnosticsState = () =>
  diagnosticsFlowController.clearComponentLintDiagnosticsState()
const clearStylesLintDiagnosticsState = () =>
  diagnosticsFlowController.clearStylesLintDiagnosticsState()
const renderPreview = async () => diagnosticsFlowController.renderPreview()
const maybeRender = () => diagnosticsFlowController.maybeRender()
const maybeRenderFromComponentEditorChange = () =>
  diagnosticsFlowController.maybeRenderFromComponentEditorChange()

function setJsxSource(value) {
  setJsxSourceValue({
    value,
    jsxCodeEditor,
    setSuppressEditorChangeSideEffects: nextValue =>
      (suppressEditorChangeSideEffects = nextValue),
    jsxEditor,
  })
}

function setCssSource(value) {
  setCssSourceValue({
    value,
    cssCodeEditor,
    setSuppressEditorChangeSideEffects: nextValue =>
      (suppressEditorChangeSideEffects = nextValue),
    cssEditor,
  })
}

const confirmAction = options => runtimeCore.confirmAction(options)

function applyRenderMode({ mode, fromActivePrContext: _fromActivePrContext = false }) {
  runtimeCore.applyRenderMode({ mode, fromActivePrContext: _fromActivePrContext })
}

function applyStyleMode({ mode }) {
  runtimeCore.applyStyleMode({ mode })
}

bindAppEventsAndStart({
  editorUi: {
    renderMode,
    styleMode,
    autoRenderToggle,
    renderButton,
    typecheckButton,
    lintComponentButton,
    lintStylesButton,
    copyComponentButton,
    copyStylesButton,
    clearConfirmDialog,
    clearComponentButton,
    clearStylesButton,
    jsxEditor,
    cssEditor,
  },
  diagnosticsUi: {
    diagnosticsToggle,
    diagnosticsClose,
    diagnosticsClearComponent,
    diagnosticsClearStyles,
    diagnosticsClearAll,
    statusNode,
  },
  sourceActions: {
    applyRenderMode,
    applyStyleMode,
    updateRenderButtonVisibility: () => (renderButton.hidden = autoRenderToggle.checked),
    clearDiagnosticsScope,
    clearComponentLintDiagnosticsState,
    clearStylesLintDiagnosticsState,
    clearAllDiagnostics,
    setStatus,
    getJsxSource,
    getCssSource,
    getTypecheckSourcePath,
    runComponentLint,
    runStylesLint,
    renderPreview,
    setJsxSource,
    setCssSource,
    queueWorkspaceSave,
    maybeRender,
    maybeRenderFromComponentEditorChange,
    markTypeDiagnosticsStale,
    markComponentLintDiagnosticsStale,
    markStylesLintDiagnosticsStale,
    flushWorkspaceSave,
    confirmAction,
    getPendingClearAction: () => pendingClearAction,
    setPendingClearAction: value => (pendingClearAction = value),
    getDiagnosticsDrawerOpen,
    setDiagnosticsDrawerOpen,
    setTypeDiagnosticsDetails,
    setCdnLoading,
  },
  workspaceUi: {
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    workspaceTabAddMenuUi,
    workspaceTabAddButton,
    workspaceTabAddModule,
    workspaceTabAddStyles,
    addWorkspaceTab,
    syncHeaderLabels,
    renderWorkspaceTabs,
    updateRenderModeEditability,
    loadPreferredWorkspaceContext,
    getActiveWorkspaceTab,
    setActiveWorkspaceTab,
    workspaceTabsState,
    loadedStylesTabIdRef: {
      get value() {
        return loadedStylesTabId
      },
    },
    getWorkspaceTabByKind,
    workspaceSaveController,
    workspaceStorage,
    bindWorkspaceMetadataPersistence,
    setHasCompletedInitialWorkspaceBootstrap: value =>
      (hasCompletedInitialWorkspaceBootstrap = value),
  },
  themeUi: {
    appThemeButtons,
    applyTheme,
    getInitialTheme,
    getInitialRenderMode,
  },
  githubUi: {
    aiControlsToggle,
    compactAiControlsUi,
    githubTokenInfo,
    githubTokenInfoPanel,
    githubTokenInfoUi,
    prContextUi,
    githubAiContextState,
  },
  panelUi: {
    editorToolsButtons,
    panelToolsState,
    applyEditorToolsVisibility,
    panelCollapseButtons,
    togglePanelCollapse,
    applyPanelCollapseState,
  },
  lifecycle: {
    clearToastTimer: () => {
      if (!appToastDismissTimer) {
        return
      }

      clearTimeout(appToastDismissTimer)
      appToastDismissTimer = null
    },
    diagnosticsFlowController,
    chatDrawerController,
    prDrawerController,
  },
  startup: {
    renderRuntime,
    typeDiagnostics,
    clipboardSupported,
    previewBackground,
    initializeCodeEditors,
  },
})
