export const createChatDrawerEvents = ({
  toggleButton,
  closeButton,
  clearButton,
  drawer,
  sendButton,
  promptInput,
  setOpen,
  isOpen,
  onClear,
  onRequestRun,
  setChatStatus,
  renderMessages,
  getMessagesLength,
  getMessageAt,
  undoActiveTabApply,
  applyProposalToTab,
}) => {
  const onToggleButtonClick = () => {
    setOpen?.(!isOpen?.())
  }

  const onCloseButtonClick = () => {
    setOpen?.(false)
  }

  const onClearButtonClick = () => {
    onClear?.()
  }

  const onDrawerClick = event => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const button = target.closest('button[data-action]')
    if (!(button instanceof HTMLButtonElement)) {
      return
    }

    const action = button.dataset.action

    if (action === 'undo-tab-apply') {
      const undone = undoActiveTabApply?.() ?? false
      if (!undone) {
        setChatStatus?.('No tab apply action is available to undo.', 'error')
      }
      renderMessages?.()
      return
    }

    const messageIndex = Number(button.dataset.messageIndex)
    const messagesLength = getMessagesLength?.() ?? 0

    if (
      !Number.isFinite(messageIndex) ||
      messageIndex < 0 ||
      messageIndex >= messagesLength
    ) {
      return
    }

    const message = getMessageAt?.(messageIndex)
    if (!message || message.role !== 'assistant') {
      return
    }

    if (action === 'request-apply') {
      const proposalOriginalIndex = Number(button.dataset.proposalOriginalIndex)
      if (!Number.isFinite(proposalOriginalIndex) || proposalOriginalIndex < 0) {
        return
      }

      const applied = applyProposalToTab?.({ messageIndex, proposalOriginalIndex })

      if (!applied) {
        setChatStatus?.('Could not apply proposal to tab.', 'error')
      } else {
        message.appliedTargets = {
          ...(message.appliedTargets && typeof message.appliedTargets === 'object'
            ? message.appliedTargets
            : {}),
          [applied.appliedKey]: true,
        }
      }

      renderMessages?.()
    }
  }

  const onSendButtonClick = () => {
    void onRequestRun?.()
  }

  const onPromptInputKeydown = event => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return
    }

    event.preventDefault()
    void onRequestRun?.()
  }

  const onDocumentKeydown = event => {
    if (event.key === 'Escape' && isOpen?.()) {
      setOpen?.(false)
    }
  }

  toggleButton?.addEventListener('click', onToggleButtonClick)
  closeButton?.addEventListener('click', onCloseButtonClick)
  clearButton?.addEventListener('click', onClearButtonClick)
  drawer?.addEventListener('click', onDrawerClick)
  sendButton?.addEventListener('click', onSendButtonClick)
  promptInput?.addEventListener('keydown', onPromptInputKeydown)
  document.addEventListener('keydown', onDocumentKeydown)

  return {
    dispose: () => {
      toggleButton?.removeEventListener('click', onToggleButtonClick)
      closeButton?.removeEventListener('click', onCloseButtonClick)
      clearButton?.removeEventListener('click', onClearButtonClick)
      drawer?.removeEventListener('click', onDrawerClick)
      sendButton?.removeEventListener('click', onSendButtonClick)
      promptInput?.removeEventListener('keydown', onPromptInputKeydown)
      document.removeEventListener('keydown', onDocumentKeydown)
    },
  }
}
