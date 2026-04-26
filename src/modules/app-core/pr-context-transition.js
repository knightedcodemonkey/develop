import {
  hasClosedPrVerificationStatus,
  hasIncompletePrMetadataInputs,
  hasSelectedRepositoryMismatch,
  hasWorkspaceRepositoryMismatch,
} from './pr-context-state.js'

const resolvePrContextTransition = ({
  hasActiveContextPayload,
  activeContextRepositoryFullName,
  selectedRepositoryFullName,
  workspaceRepositoryFullName,
  workspacePrContextState,
  hasObservedActivePrContextInSession,
  statusText,
  headBranchValue,
  prTitleValue,
}) => {
  if (hasActiveContextPayload) {
    if (
      hasSelectedRepositoryMismatch({
        selectedRepositoryFullName,
        contextRepositoryFullName: activeContextRepositoryFullName,
      })
    ) {
      return { kind: 'ignore' }
    }

    return {
      kind: 'activate',
      nextWorkspaceRepositoryFullName: activeContextRepositoryFullName,
    }
  }

  if (workspacePrContextState !== 'active') {
    return { kind: 'noop' }
  }

  if (
    hasWorkspaceRepositoryMismatch({
      workspaceRepositoryFullName,
      selectedRepositoryFullName,
    })
  ) {
    return { kind: 'ignore' }
  }

  if (hasClosedPrVerificationStatus(statusText)) {
    return { kind: 'mark-closed' }
  }

  if (
    hasObservedActivePrContextInSession &&
    hasIncompletePrMetadataInputs({
      headBranchValue,
      prTitleValue,
    })
  ) {
    return { kind: 'mark-inactive' }
  }

  return { kind: 'noop' }
}

export { resolvePrContextTransition }
