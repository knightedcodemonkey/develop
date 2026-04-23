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
    const toSafeText = value => (typeof value === 'string' ? value.trim() : '')
    const activePrContext =
      typeof getActivePrContext === 'function' ? getActivePrContext() : null
    const prContextState =
      typeof getPrContextState === 'function' ? getPrContextState() : 'inactive'
    const isActivePrContext = toSafeText(prContextState).toLowerCase() === 'active'
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
    const contextBaseBranch = toSafeText(activePrContext?.baseBranch)
    const contextHeadBranch = toSafeText(activePrContext?.headBranch)
    const contextPrTitle = toSafeText(activePrContext?.prTitle)
    const formBaseBranch = toSafeText(githubPrBaseBranch?.value)
    const formHeadBranch = toSafeText(githubPrHeadBranch?.value)
    const formPrTitle = toSafeText(githubPrTitle?.value)

    return {
      repositoryFullName: getCurrentSelectedRepository(),
      baseBranch:
        isActivePrContext && contextBaseBranch ? contextBaseBranch : formBaseBranch,
      headBranch:
        isActivePrContext && contextHeadBranch ? contextHeadBranch : formHeadBranch,
      prTitle: isActivePrContext && contextPrTitle ? contextPrTitle : formPrTitle,
      prNumber,
      prContextState,
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
