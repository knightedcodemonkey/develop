const createWorkspaceRecordAppliedHandler = ({
  getPrDrawerController,
  setWorkspaceRepositoryFullName,
  byotControls,
  getGithubPrBodyValue,
  normalizeRenderMode,
  getStyleModeValue,
}) => {
  const onWorkspaceRecordApplied = workspace => {
    if (!workspace || typeof workspace !== 'object') {
      return
    }

    const prDrawerController = getPrDrawerController?.()
    prDrawerController?.clearSelectedRepositoryActivePrContext({ resetForm: false })

    const nextWorkspaceRepositoryFullName =
      typeof workspace.repo === 'string' ? workspace.repo.trim() : ''
    if (nextWorkspaceRepositoryFullName) {
      setWorkspaceRepositoryFullName(nextWorkspaceRepositoryFullName)
      byotControls?.setSelectedRepository(nextWorkspaceRepositoryFullName)
    } else {
      setWorkspaceRepositoryFullName('')
    }

    const state =
      typeof workspace.prContextState === 'string'
        ? workspace.prContextState.trim().toLowerCase()
        : ''
    const shouldHydratePrContext = state === 'active'
    if (!shouldHydratePrContext || !prDrawerController) {
      return
    }

    prDrawerController.hydrateActivePrContext(
      {
        baseBranch: typeof workspace.base === 'string' ? workspace.base : '',
        headBranch: typeof workspace.head === 'string' ? workspace.head : '',
        prTitle: typeof workspace.prTitle === 'string' ? workspace.prTitle : '',
        prBody: getGithubPrBodyValue?.() || '',
        pullRequestNumber:
          typeof workspace.prNumber === 'number' && Number.isFinite(workspace.prNumber)
            ? workspace.prNumber
            : null,
        pullRequestUrl: '',
        renderMode: normalizeRenderMode(workspace.renderMode),
        styleMode: getStyleModeValue?.() || '',
      },
      {
        repositoryFullName:
          typeof workspace.repo === 'string' ? workspace.repo.trim() : '',
      },
    )
  }

  return onWorkspaceRecordApplied
}

export { createWorkspaceRecordAppliedHandler }
