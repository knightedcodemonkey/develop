const createWorkspaceTabSelectors = ({
  workspaceTabsState,
  getTabKind,
  toNonEmptyWorkspaceText,
}) => {
  const getActiveWorkspaceTab = () =>
    workspaceTabsState.getTab(workspaceTabsState.getActiveTabId())

  const getEntryWorkspaceTab = () =>
    workspaceTabsState.getTabs().find(tab => tab?.role === 'entry') ?? null

  const getPrimaryStyleWorkspaceTab = () =>
    workspaceTabsState.getTabs().find(tab => getTabKind(tab) === 'styles') ?? null

  const getInitialLoadedTabIds = () => ({
    componentTabId: toNonEmptyWorkspaceText(getEntryWorkspaceTab()?.id),
    stylesTabId: toNonEmptyWorkspaceText(getPrimaryStyleWorkspaceTab()?.id),
  })

  return {
    getActiveWorkspaceTab,
    getEntryWorkspaceTab,
    getPrimaryStyleWorkspaceTab,
    getInitialLoadedTabIds,
  }
}

export { createWorkspaceTabSelectors }
