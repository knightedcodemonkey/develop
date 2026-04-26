const toSafeText = value => (typeof value === 'string' ? value.trim() : '')

const hasActivePrIdentity = ({
  activeContext,
  toNonEmptyWorkspaceText,
  toPullRequestNumber,
  parsePullRequestNumberFromUrl,
}) => {
  if (!activeContext || typeof activeContext !== 'object') {
    return false
  }

  return (
    Boolean(toNonEmptyWorkspaceText(activeContext.headBranch)) ||
    toPullRequestNumber(activeContext.pullRequestNumber) !== null ||
    parsePullRequestNumberFromUrl(activeContext.pullRequestUrl) !== null
  )
}

const hasSelectedRepositoryMismatch = ({
  selectedRepositoryFullName,
  contextRepositoryFullName,
}) => {
  return (
    Boolean(toSafeText(selectedRepositoryFullName)) &&
    Boolean(toSafeText(contextRepositoryFullName)) &&
    toSafeText(selectedRepositoryFullName) !== toSafeText(contextRepositoryFullName)
  )
}

const hasWorkspaceRepositoryMismatch = ({
  workspaceRepositoryFullName,
  selectedRepositoryFullName,
}) => {
  return (
    Boolean(toSafeText(workspaceRepositoryFullName)) &&
    Boolean(toSafeText(selectedRepositoryFullName)) &&
    toSafeText(workspaceRepositoryFullName) !== toSafeText(selectedRepositoryFullName)
  )
}

const hasClosedPrVerificationStatus = statusText => {
  return toSafeText(statusText).includes(
    'Saved pull request context is not open on GitHub.',
  )
}

const hasIncompletePrMetadataInputs = ({ headBranchValue, prTitleValue }) => {
  return !toSafeText(headBranchValue) || !toSafeText(prTitleValue)
}

export {
  hasActivePrIdentity,
  hasClosedPrVerificationStatus,
  hasIncompletePrMetadataInputs,
  hasSelectedRepositoryMismatch,
  hasWorkspaceRepositoryMismatch,
}
