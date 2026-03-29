const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

export const parsePullRequestNumberFromUrl = value => {
  const raw = toSafeText(value)
  if (!raw) {
    return null
  }

  const match = raw.match(/\/pull\/(\d+)(?:$|[/?#])/)
  if (!match) {
    return null
  }

  const number = Number(match[1])
  return Number.isFinite(number) && number > 0 ? number : null
}

export const formatActivePrReference = activeContext => {
  const repositoryFullName = toSafeText(activeContext?.repositoryFullName)
  const repositoryName = repositoryFullName.includes('/')
    ? repositoryFullName.split('/').pop()
    : repositoryFullName
  const pullRequestNumber =
    typeof activeContext?.pullRequestNumber === 'number' &&
    Number.isFinite(activeContext.pullRequestNumber)
      ? activeContext.pullRequestNumber
      : parsePullRequestNumberFromUrl(activeContext?.pullRequestUrl)

  if (repositoryName && pullRequestNumber) {
    return `${repositoryName}/pr/${pullRequestNumber}`
  }

  if (repositoryFullName && pullRequestNumber) {
    return `${repositoryFullName}/pr/${pullRequestNumber}`
  }

  return ''
}

export const getActivePrContextSyncKey = activeContext => {
  const repositoryFullName = toSafeText(activeContext?.repositoryFullName)
  const headBranch = toSafeText(activeContext?.headBranch)
  const componentFilePath = toSafeText(activeContext?.componentFilePath)
  const stylesFilePath = toSafeText(activeContext?.stylesFilePath)
  const pullRequestNumber =
    typeof activeContext?.pullRequestNumber === 'number' &&
    Number.isFinite(activeContext.pullRequestNumber)
      ? String(activeContext.pullRequestNumber)
      : ''
  const pullRequestUrl = toSafeText(activeContext?.pullRequestUrl)

  if (!repositoryFullName || !headBranch || !componentFilePath || !stylesFilePath) {
    return ''
  }

  return [
    repositoryFullName,
    headBranch,
    componentFilePath,
    stylesFilePath,
    pullRequestNumber,
    pullRequestUrl,
  ].join('|')
}
