export const bindControllerEvents = ({
  state,
  toggleButton,
  closeButton,
  repositorySelect,
  baseBranchInput,
  headBranchInput,
  prTitleInput,
  prBodyInput,
  submitButton,
  setOpen,
  runSubmit,
  persistCurrentConfig,
  setSelectedRepository,
  setSubmitButtonLabel,
  emitActivePrContextChange,
  verifyActivePullRequestContext,
  syncFormForRepository,
  loadBaseBranchesForSelectedRepository,
  getFormValues,
  toSafeText,
}) => {
  toggleButton?.addEventListener('click', () => {
    setOpen(!state.open)
  })

  closeButton?.addEventListener('click', () => {
    setOpen(false)
  })

  repositorySelect?.addEventListener('change', () => {
    if (!(repositorySelect instanceof HTMLSelectElement)) {
      return
    }

    const repositoryFullName = toSafeText(repositorySelect.value)
    if (!repositoryFullName) {
      return
    }

    setSelectedRepository?.(repositoryFullName)
    syncFormForRepository({ resetBranch: true })
    setSubmitButtonLabel()
    emitActivePrContextChange()
    void verifyActivePullRequestContext()
    void loadBaseBranchesForSelectedRepository({
      preferredBranch: getFormValues().baseBranch,
    })
  })

  baseBranchInput?.addEventListener('change', persistCurrentConfig)
  baseBranchInput?.addEventListener('blur', persistCurrentConfig)
  headBranchInput?.addEventListener('blur', persistCurrentConfig)
  prTitleInput?.addEventListener('blur', persistCurrentConfig)
  prBodyInput?.addEventListener('blur', persistCurrentConfig)

  submitButton?.addEventListener('click', () => {
    if (state.submitting) {
      return
    }

    void runSubmit()
  })
}
