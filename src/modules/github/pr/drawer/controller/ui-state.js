export const createUiStateHandlers = ({
  state,
  repositorySelect,
  baseBranchInput,
  headBranchInput,
  prTitleInput,
  prBodyInput,
  commitMessageInput,
  includeAppWrapperToggle,
  submitButton,
  titleNode,
  statusNode,
  drawer,
  onActivePrContextChange,
  onRestoreRenderMode,
  onRestoreStyleMode,
  normalizeRenderMode,
  normalizeStyleMode,
  toSafeText,
  getCurrentActivePrContext,
}) => {
  const syncModeFields = () => {
    const isPushCommitMode = Boolean(getCurrentActivePrContext())

    if (repositorySelect instanceof HTMLSelectElement) {
      repositorySelect.disabled = state.submitting || isPushCommitMode
    }

    if (baseBranchInput instanceof HTMLSelectElement) {
      baseBranchInput.disabled = state.submitting || isPushCommitMode
    }

    if (baseBranchInput instanceof HTMLInputElement) {
      baseBranchInput.readOnly = isPushCommitMode
      baseBranchInput.disabled = state.submitting
    }

    if (headBranchInput instanceof HTMLInputElement) {
      headBranchInput.readOnly = isPushCommitMode
      headBranchInput.disabled = state.submitting
    }

    if (prTitleInput instanceof HTMLInputElement) {
      prTitleInput.required = !isPushCommitMode
      prTitleInput.readOnly = isPushCommitMode
      prTitleInput.disabled = state.submitting
    }

    const prBodyField = prBodyInput?.closest('.github-pr-field')
    if (prBodyField instanceof HTMLElement) {
      prBodyField.hidden = isPushCommitMode
    }

    if (prBodyInput instanceof HTMLTextAreaElement) {
      prBodyInput.required = false
      prBodyInput.disabled = state.submitting || isPushCommitMode
    }

    if (includeAppWrapperToggle instanceof HTMLInputElement) {
      includeAppWrapperToggle.disabled = state.submitting
    }

    if (commitMessageInput instanceof HTMLInputElement) {
      commitMessageInput.required = false
      commitMessageInput.readOnly = false
      commitMessageInput.disabled = state.submitting
    }
  }

  const setSubmitButtonLabel = ({ isPending = false } = {}) => {
    if (!(submitButton instanceof HTMLButtonElement)) {
      return
    }

    const activeContext = getCurrentActivePrContext()
    const isPushCommitMode = Boolean(activeContext)

    if (drawer instanceof HTMLElement) {
      drawer.dataset.mode = isPushCommitMode ? 'push' : 'open'
    }

    if (isPending) {
      submitButton.textContent = isPushCommitMode ? 'Pushing commit...' : 'Opening PR...'
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = isPushCommitMode ? 'Push Commit' : 'Open Pull Request'
      }
      syncModeFields()
      return
    }

    submitButton.textContent = isPushCommitMode ? 'Push commit' : 'Open PR'

    if (titleNode instanceof HTMLElement) {
      titleNode.textContent = isPushCommitMode ? 'Push Commit' : 'Open Pull Request'
    }

    syncModeFields()
  }

  const emitRenderModeRestore = activeContext => {
    if (typeof onRestoreRenderMode !== 'function') {
      return
    }

    if (!activeContext) {
      return
    }

    const mode = normalizeRenderMode(activeContext?.renderMode)
    onRestoreRenderMode(mode)
  }

  const emitStyleModeRestore = activeContext => {
    if (typeof onRestoreStyleMode !== 'function') {
      return
    }

    if (!activeContext) {
      return
    }

    const mode = normalizeStyleMode(activeContext?.styleMode)
    onRestoreStyleMode(mode)
  }

  const emitActivePrContextChange = () => {
    if (typeof onActivePrContextChange !== 'function') {
      return
    }

    const activeContext = getCurrentActivePrContext()
    onActivePrContextChange(activeContext)
    emitRenderModeRestore(activeContext)
    emitStyleModeRestore(activeContext)
  }

  const setStatus = (text, level = 'neutral') => {
    if (!statusNode) {
      return
    }

    statusNode.textContent = text
    statusNode.dataset.level = level
  }

  const setPendingState = isPending => {
    state.submitting = isPending

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = isPending
      submitButton.setAttribute('aria-busy', isPending ? 'true' : 'false')
      submitButton.classList.toggle('render-button--loading', isPending)
      setSubmitButtonLabel({ isPending })
    }

    for (const input of [
      repositorySelect,
      baseBranchInput,
      headBranchInput,
      prTitleInput,
      prBodyInput,
      commitMessageInput,
      includeAppWrapperToggle,
    ]) {
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement ||
        input instanceof HTMLTextAreaElement
      ) {
        input.disabled = isPending
      }
    }

    syncModeFields()
  }

  const getFormValues = () => {
    return {
      baseBranch: toSafeText(baseBranchInput?.value),
      headBranch: toSafeText(headBranchInput?.value),
      prTitle: toSafeText(prTitleInput?.value),
      prBody: typeof prBodyInput?.value === 'string' ? prBodyInput.value.trim() : '',
      commitMessage: toSafeText(commitMessageInput?.value),
    }
  }

  return {
    emitActivePrContextChange,
    getFormValues,
    setPendingState,
    setStatus,
    setSubmitButtonLabel,
    syncModeFields,
  }
}
