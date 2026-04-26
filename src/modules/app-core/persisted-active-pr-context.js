const createPersistedActivePrContextGetter = ({
  getCurrentSelectedRepositoryFullName,
  getWorkspacePrContextState,
  getWorkspacePrNumber,
  githubPrBaseBranch,
  githubPrHeadBranch,
  githubPrTitle,
  githubPrBody,
  renderMode,
  styleMode,
}) => {
  return repositoryFullName => {
    const normalizedRepository =
      typeof repositoryFullName === 'string' ? repositoryFullName.trim() : ''
    if (!normalizedRepository) {
      return null
    }

    if (normalizedRepository !== getCurrentSelectedRepositoryFullName()) {
      return null
    }

    if (getWorkspacePrContextState() !== 'active') {
      return null
    }

    const headBranch =
      typeof githubPrHeadBranch?.value === 'string' ? githubPrHeadBranch.value.trim() : ''
    const prTitle =
      typeof githubPrTitle?.value === 'string' ? githubPrTitle.value.trim() : ''
    const rawPullRequestNumber = getWorkspacePrNumber()
    const pullRequestNumber =
      typeof rawPullRequestNumber === 'number' && Number.isFinite(rawPullRequestNumber)
        ? rawPullRequestNumber
        : null

    if (!headBranch && pullRequestNumber === null) {
      return null
    }

    return {
      repositoryFullName: normalizedRepository,
      baseBranch:
        typeof githubPrBaseBranch?.value === 'string'
          ? githubPrBaseBranch.value.trim()
          : '',
      headBranch,
      prTitle,
      prBody: typeof githubPrBody?.value === 'string' ? githubPrBody.value : '',
      pullRequestNumber,
      pullRequestUrl: '',
      renderMode: renderMode?.value,
      styleMode: styleMode?.value,
    }
  }
}

export { createPersistedActivePrContextGetter }
