const createWorkspaceTabSelectionController = ({
  toNonEmptyWorkspaceText,
  workspaceTabsState,
  loadWorkspaceTabIntoEditor,
  renderWorkspaceTabs,
  updateRenderModeEditability,
  persistActiveTabEditorContent,
  getActiveWorkspaceTab,
  flushWorkspaceSave,
  onActiveWorkspaceTabChange = () => {},
}) => {
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
      updateRenderModeEditability()
      onActiveWorkspaceTabChange(targetTab, { changed: false })
      return
    }

    persistActiveTabEditorContent()

    const changed = workspaceTabsState.setActiveTab(targetTab.id)
    const activeTab = getActiveWorkspaceTab()
    if (activeTab) {
      loadWorkspaceTabIntoEditor(activeTab)
      onActiveWorkspaceTabChange(activeTab, { changed: true })
    }

    renderWorkspaceTabs()
    updateRenderModeEditability()

    if (!changed) {
      return
    }

    void flushWorkspaceSave().catch(() => {
      /* Save failures are already surfaced through saver onError. */
    })
  }

  return {
    setActiveWorkspaceTab,
  }
}

export { createWorkspaceTabSelectionController }
