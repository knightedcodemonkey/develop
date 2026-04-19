const createWorkspaceContextSnapshotGetter =
  ({
    getCurrentSelectedRepository,
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
    getActivePrContext,
    getPrContextState,
    getPrNumber,
  }) =>
  () => {
    const activePrContext =
      typeof getActivePrContext === 'function' ? getActivePrContext() : null
    const activePrNumber =
      typeof activePrContext?.pullRequestNumber === 'number' &&
      Number.isFinite(activePrContext.pullRequestNumber)
        ? activePrContext.pullRequestNumber
        : null
    const nextPrNumber = typeof getPrNumber === 'function' ? getPrNumber() : null
    const persistedPrNumber =
      Number.isFinite(nextPrNumber) && Number(nextPrNumber) > 0
        ? Number(nextPrNumber)
        : null
    const prNumber = activePrNumber ?? persistedPrNumber

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
