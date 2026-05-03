import { createWorkspaceContextController } from './workspace-context-controller.js'
import { createWorkspaceSaveController } from './workspace-save-controller.js'
import { createWorkspaceTabMutationsController } from './workspace-tab-mutations-controller.js'
import { createWorkspaceTabSelectionController } from './workspace-tab-selection-controller.js'
import { createWorkspaceTabsRenderer } from './workspace-tabs-renderer.js'

const createWorkspaceControllersSetup = ({
  createDebouncedWorkspaceSaver,
  workspaceStorage,
  getHasGitHubToken,
  getWorkspacesDrawerController,
  toNonEmptyWorkspaceText,
  buildWorkspaceRecordSnapshot,
  setStatus,
  getIsApplyingWorkspaceSnapshot,
  getActiveWorkspaceCreatedAt,
  setActiveWorkspaceRecordId,
  setActiveWorkspaceCreatedAt,
  setWorkspacePrContextState,
  setWorkspacePrNumber,
  setWorkspaceScopeMarker,
  getCurrentSelectedRepository,
  getActiveWorkspaceRecordId,
  setIsApplyingWorkspaceSnapshot,
  ensureWorkspaceTabsShape,
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrTitle,
  workspaceTabsState,
  resolveWorkspaceActiveTabId,
  normalizeRenderMode,
  getRenderModeValue,
  setRenderModeValue,
  onWorkspaceRecordApplied,
  getActiveWorkspaceTab,
  onActiveWorkspaceTabChange,
  loadWorkspaceTabIntoEditor,
  updateRenderModeEditability,
  getHasCompletedInitialWorkspaceBootstrap,
  maybeRender,
  toWorkspaceRecordKey,
  workspaceTabsStrip,
  getWorkspaceTabRenameState,
  getDraggedWorkspaceTabId,
  setDraggedWorkspaceTabId,
  getDragOverWorkspaceTabId,
  setDragOverWorkspaceTabId,
  getSuppressWorkspaceTabClick,
  setSuppressWorkspaceTabClick,
  getIsRenderingWorkspaceTabs,
  setIsRenderingWorkspaceTabs,
  getHasPendingWorkspaceTabsRender,
  setHasPendingWorkspaceTabsRender,
  persistActiveTabEditorContent,
  getWorkspaceTabDisplay,
  getShouldShowEditedDesign,
  workspaceTabsShell,
  workspaceTabAddWrap,
  setWorkspaceTabRenameState,
  getAllowedEntryTabFileNames,
  getPathFileName,
  normalizeEntryTabPath,
  normalizeModuleTabPathForRename,
  defaultComponentTabName,
  getDirtyStateForTabChange,
  syncHeaderLabels,
  setWorkspaceTabAddMenuOpen,
  confirmAction,
  isStyleWorkspaceTab,
  clearTrackedWorkspaceTab,
  trackRemovedWorkspaceTab,
  getWorkspaceTabByKind,
  makeUniqueTabPath,
  createWorkspaceTabId,
}) => {
  let workspaceTabsRenderer = null
  let workspaceTabMutationsController = null
  let activeWorkspaceLoadTransactionId = 0

  const beginWorkspaceLoadTransaction = () => {
    activeWorkspaceLoadTransactionId += 1
    return activeWorkspaceLoadTransactionId
  }

  const getActiveWorkspaceLoadTransactionId = () => activeWorkspaceLoadTransactionId

  const renderWorkspaceTabs = () => workspaceTabsRenderer.renderWorkspaceTabs()

  const refreshLocalContextOptions = async () =>
    workspaceContextController.refreshLocalContextOptions()

  const workspaceSaveController = createWorkspaceSaveController({
    createDebouncedWorkspaceSaver,
    workspaceStorage,
    toNonEmptyWorkspaceText,
    buildWorkspaceRecordSnapshot,
    refreshLocalContextOptions,
    setStatus,
    getIsApplyingWorkspaceSnapshot,
    getActiveWorkspaceRecordId,
    getActiveWorkspaceCreatedAt,
    setActiveWorkspaceRecordId,
    setActiveWorkspaceCreatedAt,
    getHasCompletedInitialWorkspaceBootstrap,
    getActiveWorkspaceLoadTransactionId,
  })

  const queueWorkspaceSave = options =>
    workspaceSaveController.queueWorkspaceSave(options)

  const flushWorkspaceSave = async options =>
    workspaceSaveController.flushWorkspaceSave(options)

  const cancelPendingWorkspaceSave = () =>
    workspaceSaveController.cancelPendingWorkspaceSave()

  const workspaceTabSelectionController = createWorkspaceTabSelectionController({
    toNonEmptyWorkspaceText,
    workspaceTabsState,
    loadWorkspaceTabIntoEditor,
    renderWorkspaceTabs: () => renderWorkspaceTabs(),
    updateRenderModeEditability: () => updateRenderModeEditability(),
    persistActiveTabEditorContent,
    getActiveWorkspaceTab,
    flushWorkspaceSave,
    onActiveWorkspaceTabChange,
  })

  const setActiveWorkspaceTab = tabId =>
    workspaceTabSelectionController.setActiveWorkspaceTab(tabId)

  workspaceTabMutationsController = createWorkspaceTabMutationsController({
    toNonEmptyWorkspaceText,
    workspaceTabsState,
    setWorkspaceTabRenameState: value => {
      setWorkspaceTabRenameState(value)
    },
    renderWorkspaceTabs: () => renderWorkspaceTabs(),
    setStatus,
    getAllowedEntryTabFileNames,
    getRenderModeValue,
    getPathFileName,
    normalizeEntryTabPath,
    normalizeModuleTabPathForRename,
    defaultComponentTabName,
    getDirtyStateForTabChange,
    syncHeaderLabels,
    queueWorkspaceSave,
    flushWorkspaceSave,
    maybeRender: () => maybeRender(),
    setWorkspaceTabAddMenuOpen,
    confirmAction,
    isStyleWorkspaceTab,
    persistActiveTabEditorContent,
    clearTrackedWorkspaceTab,
    trackRemovedWorkspaceTab,
    getActiveWorkspaceTab,
    loadWorkspaceTabIntoEditor,
    getWorkspaceTabByKind,
    setActiveWorkspaceTab,
    makeUniqueTabPath,
    createWorkspaceTabId,
    getShouldShowEditedDesign,
  })

  const beginWorkspaceTabRenameDelegate = tabId =>
    workspaceTabMutationsController.beginWorkspaceTabRename(tabId)

  const finishWorkspaceTabRenameDelegate = ({ tabId, nextName, cancelled = false }) =>
    workspaceTabMutationsController.finishWorkspaceTabRename({
      tabId,
      nextName,
      cancelled,
    })

  const removeWorkspaceTabDelegate = tabId =>
    workspaceTabMutationsController.removeWorkspaceTab(tabId)

  workspaceTabsRenderer = createWorkspaceTabsRenderer({
    workspaceTabsStrip,
    workspaceTabsState,
    getWorkspaceTabRenameState,
    getDraggedWorkspaceTabId,
    setDraggedWorkspaceTabId,
    getDragOverWorkspaceTabId,
    setDragOverWorkspaceTabId,
    getSuppressWorkspaceTabClick,
    setSuppressWorkspaceTabClick,
    getIsRenderingWorkspaceTabs,
    setIsRenderingWorkspaceTabs,
    getHasPendingWorkspaceTabsRender,
    setHasPendingWorkspaceTabsRender,
    setActiveWorkspaceTab,
    persistActiveTabEditorContent,
    queueWorkspaceSave,
    beginWorkspaceTabRename: beginWorkspaceTabRenameDelegate,
    finishWorkspaceTabRename: finishWorkspaceTabRenameDelegate,
    removeWorkspaceTab: removeWorkspaceTabDelegate,
    getWorkspaceTabDisplay,
    getShouldShowEditedDesign,
    workspaceTabsShell,
    workspaceTabAddWrap,
  })

  const workspaceContextController = createWorkspaceContextController({
    workspaceStorage,
    getHasGitHubToken,
    getCurrentSelectedRepository,
    getWorkspacesDrawerController,
    getActiveWorkspaceRecordId,
    setActiveWorkspaceRecordId,
    setActiveWorkspaceCreatedAt,
    setWorkspacePrContextState,
    setWorkspacePrNumber,
    setWorkspaceScopeMarker,
    cancelPendingWorkspaceSave,
    setIsApplyingWorkspaceSnapshot,
    ensureWorkspaceTabsShape,
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    workspaceTabsState,
    resolveWorkspaceActiveTabId,
    normalizeRenderMode,
    getRenderModeValue,
    setRenderModeValue,
    onWorkspaceRecordApplied,
    getActiveWorkspaceTab,
    loadWorkspaceTabIntoEditor,
    renderWorkspaceTabs: () => renderWorkspaceTabs(),
    updateRenderModeEditability: () => updateRenderModeEditability(),
    getHasCompletedInitialWorkspaceBootstrap,
    maybeRender: () => maybeRender(),
    setStatus,
    toWorkspaceRecordKey,
    beginWorkspaceLoadTransaction,
    getHeadBranchValue: () =>
      typeof githubPrHeadBranch?.value === 'string'
        ? githubPrHeadBranch.value.trim()
        : '',
  })

  const listLocalContextRecords = async () =>
    workspaceContextController.listLocalContextRecords()

  const applyWorkspaceRecord = async (workspace, { silent = false } = {}) =>
    workspaceContextController.applyWorkspaceRecord(workspace, { silent })

  const addWorkspaceTab = request =>
    workspaceTabMutationsController.addWorkspaceTab(request)

  const loadPreferredWorkspaceContext = async () =>
    workspaceContextController.loadPreferredWorkspaceContext()

  const bindWorkspaceMetadataPersistence = (element, options) =>
    workspaceSaveController.bindWorkspaceMetadataPersistence(element, options)

  return {
    workspaceSaveController,
    listLocalContextRecords,
    refreshLocalContextOptions,
    applyWorkspaceRecord,
    queueWorkspaceSave,
    flushWorkspaceSave,
    cancelPendingWorkspaceSave,
    setActiveWorkspaceTab,
    addWorkspaceTab,
    renderWorkspaceTabs,
    loadPreferredWorkspaceContext,
    bindWorkspaceMetadataPersistence,
  }
}

export { createWorkspaceControllersSetup }
