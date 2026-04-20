import { createWorkspaceContextController } from './workspace-context-controller.js'
import { createWorkspaceSaveController } from './workspace-save-controller.js'
import { createWorkspaceTabMutationsController } from './workspace-tab-mutations-controller.js'
import { createWorkspaceTabSelectionController } from './workspace-tab-selection-controller.js'
import { createWorkspaceTabsRenderer } from './workspace-tabs-renderer.js'

const createWorkspaceControllersSetup = ({
  createDebouncedWorkspaceSaver,
  workspaceStorage,
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
  persistRenderMode,
  onWorkspaceRecordApplied,
  getActiveWorkspaceTab,
  loadWorkspaceTabIntoEditor,
  updateRenderModeEditability,
  getHasCompletedInitialWorkspaceBootstrap,
  maybeRender,
  toWorkspaceRecordId,
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
  allowedEntryTabFileNames,
  getPathFileName,
  normalizeEntryTabPath,
  normalizeModuleTabPathForRename,
  defaultComponentTabName,
  getDirtyStateForTabChange,
  syncHeaderLabels,
  setWorkspaceTabAddMenuOpen,
  confirmAction,
  getTabKind,
  getLoadedComponentTabId,
  setLoadedComponentTabId,
  getLoadedStylesTabId,
  setLoadedStylesTabId,
  getWorkspaceTabByKind,
  makeUniqueTabPath,
  createWorkspaceTabId,
}) => {
  let workspaceTabsRenderer = null
  let workspaceTabMutationsController = null

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
    getActiveWorkspaceCreatedAt,
    setActiveWorkspaceRecordId,
    setActiveWorkspaceCreatedAt,
    getHasCompletedInitialWorkspaceBootstrap,
  })

  const queueWorkspaceSave = () => workspaceSaveController.queueWorkspaceSave()

  const flushWorkspaceSave = async () => workspaceSaveController.flushWorkspaceSave()

  const workspaceTabSelectionController = createWorkspaceTabSelectionController({
    toNonEmptyWorkspaceText,
    workspaceTabsState,
    loadWorkspaceTabIntoEditor,
    renderWorkspaceTabs: () => renderWorkspaceTabs(),
    updateRenderModeEditability: () => updateRenderModeEditability(),
    persistActiveTabEditorContent,
    getActiveWorkspaceTab,
    flushWorkspaceSave,
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
    allowedEntryTabFileNames,
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
    getTabKind,
    persistActiveTabEditorContent,
    getLoadedComponentTabId,
    setLoadedComponentTabId,
    getLoadedStylesTabId,
    setLoadedStylesTabId,
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
    getCurrentSelectedRepository,
    getWorkspacesDrawerController,
    getActiveWorkspaceRecordId,
    setActiveWorkspaceRecordId,
    setActiveWorkspaceCreatedAt,
    setWorkspacePrContextState,
    setWorkspacePrNumber,
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
    persistRenderMode,
    onWorkspaceRecordApplied,
    getActiveWorkspaceTab,
    loadWorkspaceTabIntoEditor,
    renderWorkspaceTabs: () => renderWorkspaceTabs(),
    updateRenderModeEditability: () => updateRenderModeEditability(),
    getHasCompletedInitialWorkspaceBootstrap,
    maybeRender: () => maybeRender(),
    setStatus,
    toWorkspaceRecordId,
    getHeadBranchValue: () =>
      typeof githubPrHeadBranch?.value === 'string'
        ? githubPrHeadBranch.value.trim()
        : '',
  })

  const listLocalContextRecords = async () =>
    workspaceContextController.listLocalContextRecords()

  const applyWorkspaceRecord = async (workspace, { silent = false } = {}) =>
    workspaceContextController.applyWorkspaceRecord(workspace, { silent })

  const addWorkspaceTab = kind => workspaceTabMutationsController.addWorkspaceTab(kind)

  const loadPreferredWorkspaceContext = async () =>
    workspaceContextController.loadPreferredWorkspaceContext()

  const bindWorkspaceMetadataPersistence = element =>
    workspaceSaveController.bindWorkspaceMetadataPersistence(element)

  return {
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
  }
}

export { createWorkspaceControllersSetup }
