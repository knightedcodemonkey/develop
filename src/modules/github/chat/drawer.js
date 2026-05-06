import {
  defaultGitHubChatModel,
  githubChatModelOptions,
  requestGitHubChatCompletion,
  streamGitHubChatCompletion,
} from '../api/chat.js'
import {
  formatModelAccessErrorMessage,
  isModelAccessError,
  isModelAccessStatusMessage,
  toChatText,
  toModelId,
  toRepositoryLabel,
  toRepositoryUrl,
} from './utils.js'
import {
  buildActiveTabEditorContext,
  normalizeWorkspaceTabContext,
  normalizeWorkspaceTabContexts,
} from './active-tab-context.js'
import { buildOutboundMessages as buildPayloadMessages } from './payload.js'
import { editorProposalTools, toMessageEditorProposals } from './proposals.js'
import { resolveWorkspaceTabTarget } from './tab-target-resolver.js'
import { createTabScopedUndoState } from './tab-scoped-undo-state.js'

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

export const createGitHubChatDrawer = ({
  toggleButton,
  drawer,
  closeButton,
  promptInput,
  modelSelect,
  sendButton,
  clearButton,
  statusNode,
  repositoryNode,
  messagesNode,
  includeEditorsContextToggle,
  getToken,
  getSelectedRepository,
  getWorkspaceTabContexts,
  applyWorkspaceTabContent,
  scheduleRender,
  getRenderMode,
  getStyleMode,
  getDrawerSide,
  getActiveWorkspaceTabContext,
}) => {
  let open = false
  let pendingAbortController = null
  const messages = []
  let lastAssistantBodyNode = null
  let pendingAssistantBodyText = null
  let pendingAssistantFrameId = null
  let compactedConversationSummary = ''
  let undoActionsNode = null
  const labelIconTemplateCache = {
    user: null,
    assistant: null,
  }
  const tabScopedUndoState = createTabScopedUndoState()

  const getActiveTabContext = () => {
    if (typeof getActiveWorkspaceTabContext !== 'function') {
      return null
    }

    return normalizeWorkspaceTabContext(getActiveWorkspaceTabContext())
  }

  const getWorkspaceTabs = () => {
    if (typeof getWorkspaceTabContexts !== 'function') {
      return []
    }

    return normalizeWorkspaceTabContexts(getWorkspaceTabContexts())
  }

  const getFallbackProposalTarget = () => {
    const activeTabContext = getActiveTabContext()
    if (!activeTabContext) {
      return ''
    }

    return activeTabContext.path || activeTabContext.id
  }

  const resetChatContextState = () => {
    compactedConversationSummary = ''
    tabScopedUndoState.clearAll()

    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        continue
      }

      message.appliedTargets = null
    }
  }

  const cancelPendingAssistantBodyUpdate = () => {
    if (pendingAssistantFrameId === null) {
      return
    }

    cancelAnimationFrame(pendingAssistantFrameId)
    pendingAssistantFrameId = null
  }

  const flushPendingAssistantBodyUpdate = () => {
    pendingAssistantFrameId = null

    if (pendingAssistantBodyText === null) {
      return
    }

    if (lastAssistantBodyNode) {
      lastAssistantBodyNode.textContent = pendingAssistantBodyText
      if (messagesNode) {
        messagesNode.scrollTop = messagesNode.scrollHeight
      }
      pendingAssistantBodyText = null
      return
    }

    const nextText = pendingAssistantBodyText
    pendingAssistantBodyText = null
    updateLastAssistantMessage(nextText)
  }

  const scheduleAssistantBodyUpdate = content => {
    pendingAssistantBodyText = content

    if (pendingAssistantFrameId !== null) {
      return
    }

    pendingAssistantFrameId = requestAnimationFrame(() => {
      flushPendingAssistantBodyUpdate()
    })
  }

  const stopPendingRequest = () => {
    pendingAbortController?.abort()
    pendingAbortController = null
  }

  const setModelSelectDisabled = isDisabled => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return
    }

    modelSelect.disabled = isDisabled
  }

  const replaceModelOptions = ({ modelIds, selectedModel }) => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return
    }

    const nextSelectedModel = toModelId(selectedModel)
    const nextModelIds = [...new Set([defaultGitHubChatModel, ...modelIds])]

    modelSelect.replaceChildren()

    for (const modelId of nextModelIds) {
      const option = document.createElement('option')
      option.value = modelId
      option.textContent = modelId
      option.selected = modelId === nextSelectedModel
      modelSelect.append(option)
    }

    if (!nextModelIds.includes(nextSelectedModel)) {
      modelSelect.value = defaultGitHubChatModel
    }
  }

  const getSelectedModel = () => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return defaultGitHubChatModel
    }

    return toModelId(modelSelect.value)
  }

  const initializeModelOptions = () => {
    replaceModelOptions({
      modelIds: githubChatModelOptions,
      selectedModel: defaultGitHubChatModel,
    })
  }

  const syncModelSelectionForToken = token => {
    const hasToken = typeof token === 'string' && token.trim().length > 0

    setModelSelectDisabled(!hasToken)

    if (!hasToken && modelSelect instanceof HTMLSelectElement) {
      modelSelect.value = defaultGitHubChatModel
    }

    if (hasToken && isModelAccessStatusMessage(statusNode?.textContent)) {
      setChatStatus('Idle', 'neutral')
    }
  }

  const setOpen = nextOpen => {
    open = nextOpen === true

    if (!toggleButton || !drawer) {
      return
    }

    const preferredSide = getDrawerSide?.() === 'left' ? 'left' : 'right'
    drawer.classList.toggle('ai-chat-drawer--left', preferredSide === 'left')
    drawer.classList.toggle('ai-chat-drawer--right', preferredSide !== 'left')

    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    drawer.toggleAttribute('hidden', !open)

    if (open && promptInput instanceof HTMLTextAreaElement) {
      promptInput.focus()
    }
  }

  const setChatStatus = (text, level = 'neutral') => {
    if (!statusNode) {
      return
    }

    statusNode.textContent = text
    statusNode.dataset.level = level
  }

  const syncRepositoryLabel = () => {
    if (!repositoryNode) {
      return
    }

    repositoryNode.textContent = toRepositoryLabel(getSelectedRepository?.())
  }

  const buildRequestMessages = ({ repositoryContext, editorContext }) => {
    const renderMode =
      typeof getRenderMode === 'function' ? toChatText(getRenderMode()) : 'unknown'
    const styleMode =
      typeof getStyleMode === 'function' ? toChatText(getStyleMode()) : 'unknown'

    const { outboundMessages, nextSummary } = buildPayloadMessages({
      messages,
      repositoryContext,
      editorContext,
      renderMode,
      styleMode,
      existingSummary: compactedConversationSummary,
    })

    compactedConversationSummary = nextSummary
    return outboundMessages
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

    const activeTabContext = getActiveTabContext()
    const activeTabId = activeTabContext?.id
    const activeTabUndoSnapshot = activeTabId
      ? tabScopedUndoState.getSnapshot(activeTabId)
      : null

    if (!activeTabUndoSnapshot) {
      undoNode.setAttribute('hidden', '')
      return
    }

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

  const renderMessages = () => {
    if (!messagesNode) {
      return
    }

    cancelPendingAssistantBodyUpdate()
    pendingAssistantBodyText = null
    lastAssistantBodyNode = null

    messagesNode.replaceChildren()

    if (messages.length === 0) {
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
        message.role === 'assistant' ? resolveMessageProposals(message) : []
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
          if (pendingAbortController) {
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

          actions.append(
            buildApplyButton({
              proposal,
            }),
          )
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

  const appendMessage = message => {
    messages.push(message)
    renderMessages()
  }

  const updateLastAssistantMessage = content => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return
    }

    lastMessage.content = content

    if (lastAssistantBodyNode) {
      scheduleAssistantBodyUpdate(content)
      return
    }

    renderMessages()
  }

  const scheduleRenderAfterEditorUpdate = () => {
    if (typeof scheduleRender !== 'function') {
      return
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        scheduleRender()
      })
      return
    }

    setTimeout(() => {
      scheduleRender()
    }, 0)
  }

  const preserveTrailingNewlineIfNeeded = ({ previousValue, nextValue }) => {
    if (typeof previousValue !== 'string' || typeof nextValue !== 'string') {
      return nextValue
    }

    if (!previousValue.endsWith('\n') || nextValue.endsWith('\n')) {
      return nextValue
    }

    return `${nextValue}\n`
  }

  const resolveMessageProposals = message => {
    const proposals = toMessageEditorProposals(message, {
      fallbackTarget: getFallbackProposalTarget(),
    })
    const workspaceTabs = getWorkspaceTabs()
    const activeTabId = getActiveTabContext()?.id || ''

    return proposals
      .map((proposal, proposalOriginalIndex) => {
        const resolvedTab = resolveWorkspaceTabTarget({
          target: proposal.target,
          language: proposal.language,
          tabs: workspaceTabs,
          activeTabId,
        })

        if (!resolvedTab) {
          return null
        }

        return {
          ...proposal,
          proposalOriginalIndex,
          appliedKey: resolvedTab.id,
          resolvedTab,
        }
      })
      .filter(Boolean)
  }

  const applyProposalToTab = ({ messageIndex, proposalOriginalIndex }) => {
    const message = messages[messageIndex]
    if (!message || message.role !== 'assistant') {
      return null
    }

    const proposals = toMessageEditorProposals(message, {
      fallbackTarget: getFallbackProposalTarget(),
    })
    const proposal = proposals[proposalOriginalIndex]
    if (!proposal) {
      return null
    }

    const activeTabContext = getActiveTabContext()
    const workspaceTabs = getWorkspaceTabs()
    const resolvedTab = resolveWorkspaceTabTarget({
      target: proposal.target,
      language: proposal.language,
      tabs: workspaceTabs,
      activeTabId: activeTabContext?.id || '',
    })

    if (!resolvedTab || typeof applyWorkspaceTabContent !== 'function') {
      return null
    }

    const previousValue =
      typeof resolvedTab.content === 'string' ? resolvedTab.content : ''
    const nextValue = preserveTrailingNewlineIfNeeded({
      previousValue,
      nextValue: proposal.content,
    })

    const updatedTab = applyWorkspaceTabContent({
      tabId: resolvedTab.id,
      content: nextValue,
    })
    if (!updatedTab) {
      return null
    }

    tabScopedUndoState.setSnapshot({
      tabId: resolvedTab.id,
      snapshot: {
        previousValue,
        tabName: resolvedTab.name,
      },
    })

    scheduleRenderAfterEditorUpdate()
    const tabLabel = resolvedTab.name || resolvedTab.path || resolvedTab.id
    setChatStatus(`Applied assistant proposal to ${tabLabel}.`, 'ok')
    return {
      appliedKey: resolvedTab.id,
      tabId: resolvedTab.id,
    }
  }

  const undoActiveTabApply = () => {
    const activeTabContext = getActiveTabContext()
    const activeTabId = activeTabContext?.id
    if (!activeTabId || typeof applyWorkspaceTabContent !== 'function') {
      return false
    }

    const snapshot = tabScopedUndoState.getSnapshot(activeTabId)
    if (!snapshot) {
      return false
    }

    const restored = applyWorkspaceTabContent({
      tabId: activeTabId,
      content: snapshot.previousValue,
    })
    if (!restored) {
      return false
    }

    tabScopedUndoState.clearSnapshot(activeTabId)
    scheduleRenderAfterEditorUpdate()
    const tabLabel = activeTabContext?.name || snapshot.tabName || 'active tab'
    setChatStatus(`Reverted last apply for ${tabLabel}.`, 'neutral')
    return true
  }

  const collectRepositoryContext = () => {
    const repository = getSelectedRepository?.()

    const repositoryLabel = toRepositoryLabel(repository)
    const repositoryUrl = toRepositoryUrl(repository)
    const defaultBranch =
      repository && typeof repository.defaultBranch === 'string'
        ? repository.defaultBranch
        : 'unknown'

    const contextLines = [
      'Selected repository context:',
      `- Repository: ${repositoryLabel}`,
      ...(repositoryUrl ? [`- Repository URL: ${repositoryUrl}`] : []),
      `- Default branch: ${defaultBranch}`,
      'Use this repository as the default target for the user request unless they explicitly override it.',
    ]

    return contextLines.join('\n')
  }

  const collectEditorContext = () => {
    if (!(includeEditorsContextToggle instanceof HTMLInputElement)) {
      return null
    }

    if (!includeEditorsContextToggle.checked) {
      return null
    }

    const activeTabContext = getActiveTabContext()
    if (!activeTabContext) {
      return null
    }

    const workspaceTabs = getWorkspaceTabs()

    const renderMode =
      typeof getRenderMode === 'function' ? toChatText(getRenderMode()) : ''
    const styleMode = typeof getStyleMode === 'function' ? toChatText(getStyleMode()) : ''

    return buildActiveTabEditorContext({
      activeTabContext: {
        ...activeTabContext,
        content: toChatText(activeTabContext.content),
      },
      workspaceTabContexts: workspaceTabs,
      renderMode,
      styleMode,
    })
  }

  const setPendingState = isPending => {
    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = isPending
    }

    if (promptInput instanceof HTMLTextAreaElement) {
      promptInput.disabled = isPending
    }

    if (modelSelect instanceof HTMLSelectElement) {
      if (isPending) {
        modelSelect.disabled = true
      } else {
        const token = getToken?.()
        const hasToken = typeof token === 'string' && token.trim().length > 0
        modelSelect.disabled = !hasToken
      }
    }

    renderMessages()
  }

  const attachAssistantResponseMetadata = ({ content, toolCalls, model, level }) => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return
    }

    const normalizedToolCalls = Array.isArray(toolCalls) ? toolCalls : []
    const normalizedContent = typeof content === 'string' ? content : lastMessage.content
    const hasContent =
      typeof normalizedContent === 'string' && normalizedContent.trim().length > 0

    lastMessage.content =
      hasContent || normalizedToolCalls.length === 0
        ? normalizedContent
        : 'Proposed editor update is ready. Apply below.'
    lastMessage.toolCalls = normalizedToolCalls

    if (typeof model === 'string' && model.trim()) {
      lastMessage.model = model
    }

    if (level) {
      lastMessage.level = level
    } else {
      delete lastMessage.level
    }

    renderMessages()
  }

  const runChatRequest = async () => {
    const prompt = toChatText(promptInput?.value)

    if (!prompt) {
      setChatStatus('Enter a prompt before sending.', 'error')
      return
    }

    const token = getToken?.()
    if (!token) {
      setChatStatus('Add a GitHub token before starting chat.', 'error')
      return
    }

    const selectedModel = getSelectedModel()

    stopPendingRequest()
    const requestAbortController = new AbortController()
    const requestSignal = requestAbortController.signal
    pendingAbortController = requestAbortController

    appendMessage({ role: 'user', content: prompt })
    appendMessage({ role: 'assistant', content: '', model: selectedModel })
    if (promptInput instanceof HTMLTextAreaElement) {
      promptInput.value = ''
    }

    setPendingState(true)
    setChatStatus('Streaming response from GitHub...', 'pending')

    const repositoryContext = collectRepositoryContext()
    const editorContext = collectEditorContext()
    const outboundMessages = buildRequestMessages({ repositoryContext, editorContext })
    const toolChoice = includeEditorsContextToggle?.checked ? 'auto' : 'none'

    let streamedContent = ''
    let streamSucceeded = false

    try {
      const streamResult = await streamGitHubChatCompletion({
        token,
        messages: outboundMessages,
        model: selectedModel,
        tools: editorProposalTools,
        toolChoice,
        signal: requestSignal,
        onToken: tokenChunk => {
          streamedContent += tokenChunk
          updateLastAssistantMessage(streamedContent)
        },
      })

      streamSucceeded = true
      const streamedModel = toChatText(streamResult?.model)
      const streamContent = toChatText(streamResult?.content)
      attachAssistantResponseMetadata({
        content: streamContent,
        toolCalls: streamResult?.toolCalls,
        model: streamedModel,
      })
      setChatStatus('Response streamed from GitHub.', 'ok')
    } catch (streamError) {
      if (requestSignal.aborted) {
        if (pendingAbortController === requestAbortController) {
          setChatStatus('Chat request canceled.', 'neutral')
          pendingAbortController = null
          setPendingState(false)
        }
        return
      }

      if (isModelAccessError(streamError)) {
        const modelAccessMessage = formatModelAccessErrorMessage(selectedModel)

        updateLastAssistantMessage(modelAccessMessage)
        const lastMessage = messages[messages.length - 1]
        if (lastMessage) {
          lastMessage.level = 'error'
        }
        renderMessages()
        setChatStatus(modelAccessMessage, 'error')

        if (pendingAbortController === requestAbortController) {
          pendingAbortController = null
          setPendingState(false)
        }
        return
      }

      setChatStatus(
        'Streaming unavailable. Retrying with fallback response...',
        'pending',
      )
    }

    if (streamSucceeded) {
      if (pendingAbortController === requestAbortController) {
        pendingAbortController = null
        setPendingState(false)
      }
      return
    }

    try {
      const fallbackResult = await requestGitHubChatCompletion({
        token,
        messages: outboundMessages,
        model: selectedModel,
        tools: editorProposalTools,
        toolChoice,
        signal: requestSignal,
      })

      attachAssistantResponseMetadata({
        content: toChatText(fallbackResult.content),
        toolCalls: fallbackResult?.toolCalls,
      })
      const fallbackModel = toChatText(fallbackResult.model)
      if (fallbackModel) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant' && lastMessage.model !== fallbackModel) {
          lastMessage.model = fallbackModel
          renderMessages()
        }
      }
      setChatStatus('Fallback response loaded.', 'ok')
    } catch (fallbackError) {
      if (requestSignal.aborted) {
        if (pendingAbortController === requestAbortController) {
          setChatStatus('Chat request canceled.', 'neutral')
        }
        return
      }

      const fallbackMessage = isModelAccessError(fallbackError)
        ? formatModelAccessErrorMessage(selectedModel)
        : fallbackError instanceof Error
          ? fallbackError.message
          : 'Chat request failed.'

      updateLastAssistantMessage(fallbackMessage)
      const lastMessage = messages[messages.length - 1]
      if (lastMessage) {
        lastMessage.level = 'error'
      }
      renderMessages()
      setChatStatus(`Chat request failed: ${fallbackMessage}`, 'error')
    } finally {
      if (pendingAbortController === requestAbortController) {
        pendingAbortController = null
        setPendingState(false)
      }
    }
  }

  toggleButton?.setAttribute('aria-expanded', 'false')
  drawer?.setAttribute('hidden', '')
  initializeModelOptions()
  syncModelSelectionForToken(getToken?.())
  syncRepositoryLabel()
  ensureUndoActionsNode()
  renderMessages()
  setChatStatus('Idle', 'neutral')

  const onToggleButtonClick = () => {
    setOpen(!open)
  }

  const onCloseButtonClick = () => {
    setOpen(false)
  }

  const onClearButtonClick = () => {
    stopPendingRequest()
    setPendingState(false)
    cancelPendingAssistantBodyUpdate()
    pendingAssistantBodyText = null
    resetChatContextState()
    messages.length = 0
    renderMessages()
    setChatStatus('Chat cleared.', 'neutral')
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
      const undone = undoActiveTabApply()
      if (!undone) {
        setChatStatus('No tab apply action is available to undo.', 'error')
      }
      renderMessages()
      return
    }

    const messageIndex = Number(button.dataset.messageIndex)

    if (
      !Number.isFinite(messageIndex) ||
      messageIndex < 0 ||
      messageIndex >= messages.length
    ) {
      return
    }

    const message = messages[messageIndex]
    if (!message || message.role !== 'assistant') {
      return
    }

    if (action === 'request-apply') {
      const proposalOriginalIndex = Number(button.dataset.proposalOriginalIndex)
      if (!Number.isFinite(proposalOriginalIndex) || proposalOriginalIndex < 0) {
        return
      }

      const applied = applyProposalToTab({
        messageIndex,
        proposalOriginalIndex,
      })

      if (!applied) {
        setChatStatus('Could not apply proposal to tab.', 'error')
      } else {
        message.appliedTargets = {
          ...(message.appliedTargets && typeof message.appliedTargets === 'object'
            ? message.appliedTargets
            : {}),
          [applied.appliedKey]: true,
        }
      }
      renderMessages()
      return
    }
  }

  const onSendButtonClick = () => {
    void runChatRequest()
  }

  const onPromptInputKeydown = event => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return
    }

    event.preventDefault()
    void runChatRequest()
  }

  const onDocumentKeydown = event => {
    if (event.key === 'Escape' && open) {
      setOpen(false)
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
    setOpen,
    isOpen: () => open,
    setSelectedRepository: () => {
      syncRepositoryLabel()
    },
    onActiveWorkspaceTabChange: () => {
      renderMessages()
    },
    setToken: token => {
      syncModelSelectionForToken(token)
    },
    dispose: () => {
      stopPendingRequest()
      setPendingState(false)
      cancelPendingAssistantBodyUpdate()
      pendingAssistantBodyText = null
      resetChatContextState()
      if (undoActionsNode) {
        undoActionsNode.remove()
        undoActionsNode = null
      }
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
