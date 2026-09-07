const svgNamespace = 'http://www.w3.org/2000/svg'

const createMessageLabelIconTemplate = role => {
  const iconPathByRole = {
    user: 'M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
    assistant:
      'M7.75 1a.75.75 0 0 1 0 1.5h-5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2c.199 0 .39.079.53.22.141.14.22.331.22.53v2.19l2.72-2.72a.747.747 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-2a.75.75 0 0 1 1.5 0v2c0 .464-.184.909-.513 1.237A1.746 1.746 0 0 1 13.25 12H9.06l-2.573 2.573A1.457 1.457 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25v-7.5C1 1.784 1.784 1 2.75 1h5Zm4.519-.837a.248.248 0 0 1 .466 0l.238.648a3.726 3.726 0 0 0 2.218 2.219l.649.238a.249.249 0 0 1 0 .467l-.649.238a3.725 3.725 0 0 0-2.218 2.218l-.238.649a.248.248 0 0 1-.466 0l-.239-.649a3.725 3.725 0 0 0-2.218-2.218l-.649-.238a.249.249 0 0 1 0-.467l.649-.238A3.726 3.726 0 0 0 12.03.811l.239-.648Z',
  }

  const pathData = role === 'assistant' ? iconPathByRole.assistant : iconPathByRole.user
  const svg = document.createElementNS(svgNamespace, 'svg')
  svg.setAttribute('xmlns', svgNamespace)
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('ai-chat-message__label-icon')

  const path = document.createElementNS(svgNamespace, 'path')
  path.setAttribute('d', pathData)
  svg.append(path)

  return svg
}

export const createChatMessageRenderer = ({
  messagesNode,
  resolveMessageProposals,
  getActiveUndoState,
  isRequestPending,
}) => {
  let undoActionsNode = null
  let lastAssistantBodyNode = null
  let pendingAssistantBodyText = null
  let pendingAssistantFrameId = null
  const labelIconTemplateCache = {
    user: null,
    assistant: null,
  }

  const cancelPendingAssistantBodyUpdate = () => {
    if (pendingAssistantFrameId === null) {
      return
    }

    cancelAnimationFrame(pendingAssistantFrameId)
    pendingAssistantFrameId = null
  }

  const ensureUndoActionsNode = () => {
    if (undoActionsNode) {
      return undoActionsNode
    }

    if (!(messagesNode instanceof HTMLElement)) {
      return null
    }

    const parentNode = messagesNode.parentElement
    if (!(parentNode instanceof HTMLElement)) {
      return null
    }

    undoActionsNode = document.createElement('div')
    undoActionsNode.className = 'ai-chat-drawer__undo-actions'
    undoActionsNode.setAttribute('hidden', '')
    messagesNode.insertAdjacentElement('afterend', undoActionsNode)

    return undoActionsNode
  }

  const renderUndoActions = () => {
    const undoNode = ensureUndoActionsNode()
    if (!undoNode) {
      return
    }

    undoNode.replaceChildren()

    const activeUndoState = getActiveUndoState?.() ?? null
    if (!activeUndoState) {
      undoNode.setAttribute('hidden', '')
      return
    }

    const { activeTabContext, snapshot: activeTabUndoSnapshot } = activeUndoState

    const label = document.createElement('p')
    label.className = 'ai-chat-drawer__undo-label'
    label.textContent = 'Latest applied changes'
    undoNode.append(label)

    const undoButton = document.createElement('button')
    undoButton.type = 'button'
    undoButton.className =
      'render-button render-button--small ai-chat-drawer__undo-action'
    undoButton.dataset.action = 'undo-tab-apply'
    const tabName = activeTabContext?.name || activeTabUndoSnapshot.tabName || 'tab'
    undoButton.textContent = `Undo last apply for ${tabName}`
    undoNode.append(undoButton)

    undoNode.removeAttribute('hidden')
  }

  const renderMessages = messages => {
    if (!(messagesNode instanceof HTMLElement)) {
      return
    }

    cancelPendingAssistantBodyUpdate()
    pendingAssistantBodyText = null
    lastAssistantBodyNode = null

    messagesNode.replaceChildren()

    if (!Array.isArray(messages) || messages.length === 0) {
      const emptyNode = document.createElement('p')
      emptyNode.className = 'ai-chat-empty'
      emptyNode.textContent =
        'Ask for help developing your component, styles, or repository workflow.'
      messagesNode.append(emptyNode)
      renderUndoActions()
      return
    }

    for (const [index, message] of messages.entries()) {
      const item = document.createElement('article')
      item.className = `ai-chat-message ai-chat-message--${message.role}`

      const label = document.createElement('h3')
      label.className = 'ai-chat-message__label'
      const roleLabel = message.role === 'assistant' ? 'ASSISTANT' : 'YOU'
      const roleKey = message.role === 'assistant' ? 'assistant' : 'user'

      if (!labelIconTemplateCache[roleKey]) {
        labelIconTemplateCache[roleKey] = createMessageLabelIconTemplate(roleKey)
      }

      const roleText = document.createElement('span')
      roleText.textContent = roleLabel
      label.append(roleText, labelIconTemplateCache[roleKey].cloneNode(true))

      item.append(label)

      const body = document.createElement('p')
      body.className = 'ai-chat-message__body'
      body.textContent = message.content
      item.append(body)

      const resolvedProposals =
        message.role === 'assistant' ? (resolveMessageProposals?.(message) ?? []) : []
      const hasProposal = resolvedProposals.length > 0
      const appliedTargets =
        message && typeof message.appliedTargets === 'object' && message.appliedTargets
          ? message.appliedTargets
          : {}

      if (hasProposal) {
        const actions = document.createElement('div')
        actions.className = 'ai-chat-message__actions'
        actions.dataset.messageIndex = String(index)

        const buildApplyButton = ({ proposal }) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'render-button render-button--small ai-chat-message__action'
          button.dataset.action = 'request-apply'
          button.dataset.messageIndex = String(index)
          button.dataset.proposalOriginalIndex = String(proposal.proposalOriginalIndex)
          const tabLabel =
            proposal.resolvedTab.name ||
            proposal.resolvedTab.path ||
            proposal.resolvedTab.id
          button.textContent = `Apply update to ${tabLabel}`
          button.setAttribute('aria-label', `Apply update to ${tabLabel}`)
          if (isRequestPending?.()) {
            button.disabled = true
          }
          return button
        }

        const renderedApplyKeys = new Set()

        for (const proposal of resolvedProposals) {
          if (!proposal?.appliedKey || appliedTargets[proposal.appliedKey] === true) {
            continue
          }

          if (renderedApplyKeys.has(proposal.appliedKey)) {
            continue
          }

          renderedApplyKeys.add(proposal.appliedKey)
          actions.append(buildApplyButton({ proposal }))
        }

        if (actions.childElementCount > 0) {
          item.append(actions)
        }
      }

      if (message.role === 'assistant' && index === messages.length - 1) {
        lastAssistantBodyNode = body
      }

      if (message.level === 'error') {
        item.classList.add('ai-chat-message--error')
      }

      messagesNode.append(item)
    }

    messagesNode.scrollTop = messagesNode.scrollHeight
    renderUndoActions()
  }

  const flushPendingAssistantBodyUpdate = messages => {
    pendingAssistantFrameId = null

    if (pendingAssistantBodyText === null) {
      return
    }

    if (lastAssistantBodyNode) {
      lastAssistantBodyNode.textContent = pendingAssistantBodyText
      messagesNode.scrollTop = messagesNode.scrollHeight
      pendingAssistantBodyText = null
      return
    }

    const nextText = pendingAssistantBodyText
    pendingAssistantBodyText = null
    const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : null
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content = nextText
    }
    renderMessages(messages)
  }

  const scheduleAssistantBodyUpdate = (messages, content) => {
    pendingAssistantBodyText = content

    if (pendingAssistantFrameId !== null) {
      return
    }

    pendingAssistantFrameId = requestAnimationFrame(() => {
      flushPendingAssistantBodyUpdate(messages)
    })
  }

  const updateLastAssistantMessage = (messages, content) => {
    const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : null
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return
    }

    lastMessage.content = content

    if (lastAssistantBodyNode) {
      scheduleAssistantBodyUpdate(messages, content)
      return
    }

    renderMessages(messages)
  }

  const dispose = () => {
    cancelPendingAssistantBodyUpdate()
    pendingAssistantBodyText = null

    if (undoActionsNode) {
      undoActionsNode.remove()
      undoActionsNode = null
    }
  }

  return {
    cancelPendingAssistantBodyUpdate,
    dispose,
    ensureUndoActionsNode,
    renderMessages,
    updateLastAssistantMessage,
  }
}
