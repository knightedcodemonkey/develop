import {
  isModelAccessStatusMessage,
  toChatText,
  toRepositoryLabel,
  toRepositoryUrl,
} from './utils.js'
import { createChatKeyControls } from './key-controls.js'
import { createChatModelPicker } from './model-picker.js'
import {
  buildActiveTabEditorContext,
  normalizeWorkspaceTabContext,
  normalizeWorkspaceTabContexts,
} from './active-tab-context.js'
import { buildOutboundMessages as buildPayloadMessages } from './payload.js'
import { createChatProposalActions } from './proposal-actions.js'
import { createChatRequestRunner } from './request-runner.js'
import { createChatMessageRenderer } from './message-renderer.js'
import { createChatDrawerEvents } from './drawer-events.js'

export const createChatDrawer = ({
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
  keyRoot,
  keyInput,
  keyAddButton,
  keyDeleteButton,
  includeEditorsContextToggle,
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
  let compactedConversationSummary = ''
  let proposalActions = null
  let messageRenderer = null
  let drawerEvents = null

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

  const resetChatContextState = () => {
    compactedConversationSummary = ''
    proposalActions?.resetChatContextState(messages)
  }

  const cancelPendingAssistantBodyUpdate = () => {
    messageRenderer?.cancelPendingAssistantBodyUpdate()
  }

  const stopPendingRequest = () => {
    pendingAbortController?.abort()
    pendingAbortController = null
  }

  const keyControls = createChatKeyControls({
    root: keyRoot,
    input: keyInput,
    addButton: keyAddButton,
    deleteButton: keyDeleteButton,
    onKeyChange: nextKey => {
      modelPicker.invalidateCatalogCache()
      modelPicker.syncModelSelectionForKey(nextKey)
      syncComposerAvailability()

      const keyPresent = typeof nextKey === 'string' && nextKey.trim().length > 0

      if (open && keyPresent) {
        void modelPicker.loadModelOptionsFromCatalog({ force: true })
      }
    },
  })

  const getChatKey = () => keyControls.getKey()
  const hasChatKey = () => keyControls.hasKey()

  const modelPicker = createChatModelPicker({
    modelSelect,
    getChatKey,
    resetModelAccessStatus: () => {
      if (isModelAccessStatusMessage(statusNode?.textContent)) {
        setChatStatus('Idle', 'neutral')
      }
    },
  })

  const syncComposerAvailability = () => {
    const keyPresent = hasChatKey()

    if (promptInput instanceof HTMLTextAreaElement) {
      promptInput.disabled = !keyPresent
    }

    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = !keyPresent
    }
  }

  const getSelectedModel = () => modelPicker.getSelectedModel()

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

    if (open && hasChatKey()) {
      void modelPicker.loadModelOptionsFromCatalog()
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

  const renderMessages = () => {
    messageRenderer?.renderMessages(messages)
  }

  const appendMessage = message => {
    messages.push(message)
    renderMessages()
  }

  const updateLastAssistantMessage = content => {
    messageRenderer?.updateLastAssistantMessage(messages, content)
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

  proposalActions = createChatProposalActions({
    getActiveTabContext,
    getWorkspaceTabs,
    applyWorkspaceTabContent,
    scheduleRenderAfterEditorUpdate,
    setChatStatus,
  })

  const resolveMessageProposals = message =>
    proposalActions?.resolveMessageProposals(message) ?? []

  messageRenderer = createChatMessageRenderer({
    messagesNode,
    resolveMessageProposals,
    getActiveUndoState: () => proposalActions?.getActiveTabUndoState() ?? null,
    isRequestPending: () => Boolean(pendingAbortController),
  })

  const collectRepositoryContext = () => {
    const repository = getSelectedRepository?.()
    const repositoryFullName =
      typeof repository?.fullName === 'string' ? repository.fullName.trim() : ''

    if (!repositoryFullName) {
      return ''
    }

    const repositoryUrl = toRepositoryUrl(repository)
    const defaultBranch =
      repository && typeof repository.defaultBranch === 'string'
        ? repository.defaultBranch
        : 'unknown'

    const contextLines = [
      'Selected repository context:',
      `- Repository: ${repositoryFullName}`,
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
    const composerEnabled = !isPending && hasChatKey()

    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = !composerEnabled
    }

    if (promptInput instanceof HTMLTextAreaElement) {
      promptInput.disabled = !composerEnabled
    }

    if (modelSelect instanceof HTMLSelectElement) {
      if (isPending) {
        modelSelect.disabled = true
      } else {
        modelSelect.disabled = !hasChatKey()
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
    const hasActionableToolProposal =
      !hasContent &&
      normalizedToolCalls.length > 0 &&
      resolveMessageProposals({
        role: 'assistant',
        content: normalizedContent,
        toolCalls: normalizedToolCalls,
      }).length > 0

    lastMessage.content =
      hasContent || normalizedToolCalls.length === 0
        ? normalizedContent
        : hasActionableToolProposal
          ? 'Proposed editor update is ready. Apply below.'
          : 'Proposed editor update is ready, but I could not match its target to an open tab. Ask me to target the active tab or one of the listed tab ids or paths.'
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

  const markLastAssistantError = message => {
    updateLastAssistantMessage(message)
    const lastMessage = messages[messages.length - 1]
    if (lastMessage) {
      lastMessage.level = 'error'
    }
    renderMessages()
  }

  const setLastAssistantModel = model => {
    if (!model) {
      return
    }

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.model !== model) {
      lastMessage.model = model
      renderMessages()
    }
  }

  const requestRunner = createChatRequestRunner({
    getPrompt: () => promptInput?.value,
    getToken: getChatKey,
    getSelectedModel,
    isEditorsContextIncluded: () => includeEditorsContextToggle?.checked === true,
    stopPendingRequest,
    setPendingAbortController: value => {
      pendingAbortController = value
    },
    getPendingAbortController: () => pendingAbortController,
    appendMessage,
    clearPrompt: () => {
      if (promptInput instanceof HTMLTextAreaElement) {
        promptInput.value = ''
      }
    },
    setPendingState,
    setChatStatus,
    buildOutboundMessages: () => {
      const repositoryContext = collectRepositoryContext()
      const editorContext = collectEditorContext()
      return buildRequestMessages({ repositoryContext, editorContext })
    },
    updateLastAssistantMessage,
    attachAssistantResponseMetadata,
    markLastAssistantError,
    setLastAssistantModel,
  })

  const runChatRequest = async () => {
    await requestRunner.runChatRequest()
  }

  const onClear = () => {
    stopPendingRequest()
    setPendingState(false)
    cancelPendingAssistantBodyUpdate()
    resetChatContextState()
    messages.length = 0
    renderMessages()
    setChatStatus('Chat cleared.', 'neutral')
  }

  toggleButton?.setAttribute('aria-expanded', 'false')
  drawer?.setAttribute('hidden', '')
  modelPicker.initializeModelOptions()
  modelPicker.syncModelSelectionForKey(getChatKey())
  syncComposerAvailability()
  syncRepositoryLabel()
  messageRenderer.ensureUndoActionsNode()
  renderMessages()
  setChatStatus('Idle', 'neutral')

  drawerEvents = createChatDrawerEvents({
    toggleButton,
    closeButton,
    clearButton,
    drawer,
    sendButton,
    promptInput,
    setOpen,
    isOpen: () => open,
    onClear,
    onRequestRun: runChatRequest,
    setChatStatus,
    renderMessages,
    getMessagesLength: () => messages.length,
    getMessageAt: index => messages[index],
    undoActiveTabApply: () => proposalActions?.undoActiveTabApply() ?? false,
    applyProposalToTab: ({ messageIndex, proposalOriginalIndex }) =>
      proposalActions?.applyProposalToTab({
        messages,
        messageIndex,
        proposalOriginalIndex,
      }),
  })

  return {
    setOpen,
    isOpen: () => open,
    setSelectedRepository: () => {
      syncRepositoryLabel()
    },
    onActiveWorkspaceTabChange: () => {
      renderMessages()
    },
    dispose: () => {
      stopPendingRequest()
      setPendingState(false)
      cancelPendingAssistantBodyUpdate()
      resetChatContextState()
      keyControls.dispose()
      messageRenderer?.dispose()
      drawerEvents?.dispose()
    },
  }
}
