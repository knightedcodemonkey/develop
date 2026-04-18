const createEditedIndicatorVisibilityController = ({
  getToken,
  getActivePrContext,
} = {}) => {
  let runRefresh = () => {}

  const hasToken = () => {
    const token = typeof getToken === 'function' ? getToken() : ''
    return typeof token === 'string' && token.trim().length > 0
  }

  const hasActivePrContext = () => {
    const activePrContext =
      typeof getActivePrContext === 'function' ? getActivePrContext() : null
    return Boolean(activePrContext?.prTitle)
  }

  const getShouldShowEditedDesign = () => hasToken() && hasActivePrContext()

  const setRefreshHandlers = ({ syncHeaderLabels, renderWorkspaceTabs } = {}) => {
    runRefresh = () => {
      if (typeof syncHeaderLabels === 'function') {
        syncHeaderLabels()
      }

      if (typeof renderWorkspaceTabs === 'function') {
        renderWorkspaceTabs()
      }
    }
  }

  const refreshIndicators = () => {
    runRefresh()
  }

  return {
    getShouldShowEditedDesign,
    setRefreshHandlers,
    refreshIndicators,
  }
}

export { createEditedIndicatorVisibilityController }
