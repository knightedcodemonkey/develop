import { hasActivePrIdentity } from './pr-context-state.js'
import { resolvePrContextTransition } from './pr-context-transition.js'

const createPrContextStateChangeHandler = ({
  toNonEmptyWorkspaceText,
  toPullRequestNumber,
  parsePullRequestNumberFromUrl,
  getCurrentSelectedRepositoryFullName,
  getWorkspaceRepositoryFullName,
  setWorkspaceRepositoryFullName,
  getWorkspacePrContextState,
  getHasObservedActivePrContextInSession,
  setHasObservedActivePrContextInSession,
  githubPrStatus,
  githubPrHeadBranch,
  githubPrTitle,
  workspacePrSessionHandoffController,
  setWorkspacePrNumber,
  persistWorkspacePrContextState,
  editedIndicatorVisibilityController,
}) => {
  return activeContext => {
    const hasActiveContextPayload = hasActivePrIdentity({
      activeContext,
      toNonEmptyWorkspaceText,
      toPullRequestNumber,
      parsePullRequestNumberFromUrl,
    })
    const activeContextRepositoryFullName =
      typeof activeContext?.repositoryFullName === 'string'
        ? activeContext.repositoryFullName.trim()
        : ''
    const transition = resolvePrContextTransition({
      hasActiveContextPayload,
      activeContextRepositoryFullName,
      selectedRepositoryFullName: toNonEmptyWorkspaceText(
        getCurrentSelectedRepositoryFullName(),
      ),
      workspaceRepositoryFullName: getWorkspaceRepositoryFullName(),
      workspacePrContextState: getWorkspacePrContextState(),
      hasObservedActivePrContextInSession: getHasObservedActivePrContextInSession(),
      statusText:
        typeof githubPrStatus?.textContent === 'string' ? githubPrStatus.textContent : '',
      headBranchValue:
        typeof githubPrHeadBranch?.value === 'string' ? githubPrHeadBranch.value : '',
      prTitleValue: typeof githubPrTitle?.value === 'string' ? githubPrTitle.value : '',
    })

    if (transition.kind === 'ignore') {
      editedIndicatorVisibilityController.refreshIndicators()
      return
    }

    if (transition.kind === 'activate') {
      if (transition.nextWorkspaceRepositoryFullName) {
        setWorkspaceRepositoryFullName(transition.nextWorkspaceRepositoryFullName)
      }

      setHasObservedActivePrContextInSession(true)
      workspacePrSessionHandoffController.setLastKnownPrContextMeta({
        baseBranch:
          typeof activeContext?.baseBranch === 'string' ? activeContext.baseBranch : '',
        headBranch:
          typeof activeContext?.headBranch === 'string' ? activeContext.headBranch : '',
        prTitle: typeof activeContext?.prTitle === 'string' ? activeContext.prTitle : '',
      })
      const nextPrNumber =
        toPullRequestNumber(activeContext?.pullRequestNumber) ??
        parsePullRequestNumberFromUrl(activeContext?.pullRequestUrl)
      setWorkspacePrNumber(nextPrNumber)
      persistWorkspacePrContextState('active')
    } else if (transition.kind === 'mark-closed') {
      setHasObservedActivePrContextInSession(false)
      persistWorkspacePrContextState('closed')
    } else if (transition.kind === 'mark-inactive') {
      setHasObservedActivePrContextInSession(false)
      setWorkspacePrNumber(null)
      persistWorkspacePrContextState('inactive')
    }

    editedIndicatorVisibilityController.refreshIndicators()
  }
}

export { createPrContextStateChangeHandler }
