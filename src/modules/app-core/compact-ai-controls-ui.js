export const createCompactAiControlsUiController = ({
  toggleButton,
  controlsRoot,
  closeTokenInfo,
  mediaQuery = window.matchMedia('(max-width: 900px)'),
}) => {
  let open = false

  const isCompactViewport = () => mediaQuery.matches

  const setOpen = isOpen => {
    if (
      !(toggleButton instanceof HTMLButtonElement) ||
      !(controlsRoot instanceof HTMLElement)
    ) {
      return
    }

    toggleButton.removeAttribute('hidden')

    if (!isCompactViewport()) {
      open = false
      closeTokenInfo?.()
      toggleButton.setAttribute('aria-expanded', 'false')
      controlsRoot.removeAttribute('data-compact-open')
      controlsRoot.removeAttribute('hidden')
      return
    }

    open = Boolean(isOpen)
    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    controlsRoot.dataset.compactOpen = open ? 'true' : 'false'

    if (!open) {
      closeTokenInfo?.()
    }
  }

  const toggle = () => {
    setOpen(!open)
  }

  const handleDocumentClick = target => {
    if (!(target instanceof Node)) {
      return
    }

    if (!isCompactViewport() || !open) {
      return
    }

    if (controlsRoot.contains(target) || toggleButton?.contains(target)) {
      return
    }

    setOpen(false)
  }

  const onViewportChange = listener => {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener)
      return
    }

    mediaQuery.onchange = listener
  }

  return {
    handleDocumentClick,
    isCompactViewport,
    isOpen: () => open,
    onViewportChange,
    setOpen,
    toggle,
  }
}
