export const bindControllerEvents = ({
  state,
  toggleButton,
  closeButton,
  baseBranchInput,
  headBranchInput,
  prTitleInput,
  prBodyInput,
  submitButton,
  setOpen,
  runSubmit,
  refreshContextUi,
}) => {
  toggleButton?.addEventListener('click', () => {
    setOpen(!state.open)
  })

  closeButton?.addEventListener('click', () => {
    setOpen(false)
  })

  baseBranchInput?.addEventListener('change', refreshContextUi)
  baseBranchInput?.addEventListener('blur', refreshContextUi)
  headBranchInput?.addEventListener('blur', refreshContextUi)
  prTitleInput?.addEventListener('blur', refreshContextUi)
  prBodyInput?.addEventListener('blur', refreshContextUi)

  submitButton?.addEventListener('click', () => {
    if (state.submitting) {
      return
    }

    void runSubmit()
  })
}
