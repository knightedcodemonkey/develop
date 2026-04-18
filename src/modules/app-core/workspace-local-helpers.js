const createWorkspaceContextSnapshotGetter =
  ({
    getCurrentSelectedRepository,
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    getActivePrContext,
    getPrContextState,
  }) =>
  () => {
    const activePrContext =
      typeof getActivePrContext === 'function' ? getActivePrContext() : null
    const prNumber =
      typeof activePrContext?.pullRequestNumber === 'number' &&
      Number.isFinite(activePrContext.pullRequestNumber)
        ? activePrContext.pullRequestNumber
        : null

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
      prNumber,
      prContextState:
        typeof getPrContextState === 'function' ? getPrContextState() : 'inactive',
    }
  }

const toStyleModeForTabLanguage = ({ language, toNonEmptyWorkspaceText }) => {
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

export { createWorkspaceContextSnapshotGetter, toStyleModeForTabLanguage }
