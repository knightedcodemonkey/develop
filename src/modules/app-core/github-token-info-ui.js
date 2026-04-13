export const createGitHubTokenInfoUiController = ({
  tokenInfoButton,
  tokenInfoPanel,
}) => {
  let open = false

  const isReady = () =>
    tokenInfoButton instanceof HTMLButtonElement && tokenInfoPanel instanceof HTMLElement

  const setOpen = isOpen => {
    if (!isReady()) {
      return
    }

    open = Boolean(isOpen)
    tokenInfoButton.setAttribute('aria-expanded', open ? 'true' : 'false')

    if (open) {
      tokenInfoPanel.removeAttribute('hidden')
      return
    }

    tokenInfoPanel.setAttribute('hidden', '')
  }

  const toggle = () => {
    setOpen(!open)
  }

  const shouldCloseForClickTarget = target => {
    if (!isReady() || !open || !(target instanceof Node)) {
      return false
    }

    return !tokenInfoButton.contains(target) && !tokenInfoPanel.contains(target)
  }

  return {
    close: () => setOpen(false),
    isOpen: () => open,
    setOpen,
    shouldCloseForClickTarget,
    toggle,
  }
}
