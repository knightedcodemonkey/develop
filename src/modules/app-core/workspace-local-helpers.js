const createWorkspaceContextSnapshotGetter =
  ({
    getCurrentSelectedRepository,
    githubPrBaseBranch,
    githubPrHeadBranch,
    githubPrTitle,
  }) =>
  () => ({
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
  })

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
