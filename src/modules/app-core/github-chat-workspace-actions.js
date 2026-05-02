const createGitHubChatWorkspaceActions = ({
  getActiveWorkspaceTab,
  isStyleWorkspaceTab,
  getCssSource,
  getJsxSource,
  workspaceTabsState,
  getDirtyStateForTabChange,
  loadWorkspaceTabIntoEditor,
  renderWorkspaceTabs,
  queueWorkspaceSave,
}) => {
  const getActiveWorkspaceTabContext = () => {
    const activeTab = getActiveWorkspaceTab()
    if (!activeTab) {
      return null
    }

    const isStylesTab = isStyleWorkspaceTab(activeTab)

    return {
      id: activeTab.id,
      name: activeTab.name,
      path: activeTab.path,
      language: activeTab.language,
      content: isStylesTab ? getCssSource() : getJsxSource(),
      isActive: true,
    }
  }

  const getWorkspaceTabContexts = () => {
    const activeTabId = workspaceTabsState.getActiveTabId()

    return workspaceTabsState.getTabs().map(tab => {
      const isActive = tab.id === activeTabId
      const isStylesTab = isStyleWorkspaceTab(tab)

      return {
        id: tab.id,
        name: tab.name,
        path: tab.path,
        language: tab.language,
        isActive,
        content: isActive ? (isStylesTab ? getCssSource() : getJsxSource()) : tab.content,
      }
    })
  }

  const applyWorkspaceTabContent = ({ tabId, content }) => {
    const tab = workspaceTabsState.getTab(tabId)
    if (!tab || typeof content !== 'string') {
      return null
    }

    const updatedTab = workspaceTabsState.upsertTab(
      {
        ...tab,
        content,
        isDirty: getDirtyStateForTabChange(tab, content),
        lastModified: Date.now(),
        isActive: tab.isActive,
      },
      { emitReason: 'chatApplyTabContent' },
    )

    if (!updatedTab) {
      return null
    }

    if (updatedTab.isActive) {
      loadWorkspaceTabIntoEditor(updatedTab)
    }

    renderWorkspaceTabs()
    queueWorkspaceSave()
    return updatedTab
  }

  return {
    getActiveWorkspaceTabContext,
    getWorkspaceTabContexts,
    applyWorkspaceTabContent,
  }
}

export { createGitHubChatWorkspaceActions }
