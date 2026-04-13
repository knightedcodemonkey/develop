export const createWorkspaceTabAddMenuUiController = ({
  addButton,
  addMenu,
  addModuleButton,
}) => {
  let open = false

  const setOpen = isOpen => {
    const nextOpen = Boolean(isOpen)
    if (open === nextOpen) {
      return
    }

    open = nextOpen
    if (addButton instanceof HTMLButtonElement) {
      addButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
    }

    if (addMenu instanceof HTMLElement) {
      addMenu.hidden = !nextOpen
    }

    if (
      nextOpen &&
      document.activeElement === addButton &&
      addModuleButton instanceof HTMLButtonElement
    ) {
      addModuleButton.focus()
    }

    if (
      !nextOpen &&
      addMenu instanceof HTMLElement &&
      document.activeElement instanceof Node &&
      addMenu.contains(document.activeElement) &&
      addButton instanceof HTMLButtonElement
    ) {
      addButton.focus()
    }
  }

  const toggle = () => {
    setOpen(!open)
  }

  const handleDocumentPointerdown = target => {
    if (!open) {
      return
    }

    if (target instanceof Element && target.closest('#workspace-tab-add-wrap')) {
      return
    }

    setOpen(false)
  }

  const handleEscape = event => {
    if (!open || event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    setOpen(false)
  }

  const handleAddButtonKeydown = event => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      if (addModuleButton instanceof HTMLButtonElement) {
        addModuleButton.focus()
      }
    }
  }

  return {
    handleAddButtonKeydown,
    handleDocumentPointerdown,
    handleEscape,
    isOpen: () => open,
    setOpen,
    toggle,
  }
}
