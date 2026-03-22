import {
  defaultGitHubChatModel,
  githubChatModelOptions,
  requestGitHubChatCompletion,
  streamGitHubChatCompletion,
} from './github-api.js'

const toChatText = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

const toModelId = value => {
  if (typeof value !== 'string') {
    return defaultGitHubChatModel
  }

  const model = value.trim()
  return model || defaultGitHubChatModel
}

const isModelAccessError = error => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!message) {
    return false
  }

  return (
    (message.includes('model') && message.includes('access')) ||
    (message.includes('model') && message.includes('permission')) ||
    (message.includes('model') && message.includes('not available')) ||
    (message.includes('model') && message.includes('not found')) ||
    (message.includes('model') && message.includes('not enabled')) ||
    (message.includes('forbidden') && message.includes('model'))
  )
}

const formatModelAccessErrorMessage = selectedModel => {
  const model = toModelId(selectedModel)
  return `Selected model "${model}" is not available for this token. Choose a different model.`
}

const toRepositoryLabel = repository => {
  if (!repository || typeof repository !== 'object') {
    return 'No repository selected'
  }

  if (typeof repository.fullName === 'string' && repository.fullName.trim()) {
    return repository.fullName
  }

  return 'No repository selected'
}

const toRepositoryUrl = repository => {
  if (!repository || typeof repository !== 'object') {
    return ''
  }

  if (typeof repository.htmlUrl === 'string' && repository.htmlUrl.trim()) {
    return repository.htmlUrl
  }

  if (typeof repository.fullName === 'string' && repository.fullName.trim()) {
    return `https://github.com/${repository.fullName}`
  }

  return ''
}

export const createGitHubChatDrawer = ({
  featureEnabled,
  toggleButton,
  drawer,
  closeButton,
  promptInput,
  modelSelect,
  sendButton,
  clearButton,
  statusNode,
  rateNode,
  repositoryNode,
  messagesNode,
  includeEditorsContextToggle,
  getToken,
  getSelectedRepository,
  getComponentSource,
  getStylesSource,
  getRenderMode,
  getStyleMode,
  getDrawerSide,
}) => {
  if (!featureEnabled) {
    toggleButton?.setAttribute('hidden', '')
    drawer?.setAttribute('hidden', '')

    return {
      setOpen: () => {},
      isOpen: () => false,
      setSelectedRepository: () => {},
      setToken: () => {},
      dispose: () => {},
    }
  }

  let open = false
  let pendingAbortController = null
  const messages = []
  let lastAssistantBodyNode = null
  let pendingAssistantBodyText = null
  let pendingAssistantFrameId = null

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
    setModelSelectDisabled(false)
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

  const formatResetTime = resetEpochSeconds => {
    if (!Number.isFinite(resetEpochSeconds)) {
      return ''
    }

    const resetDate = new Date(Number(resetEpochSeconds) * 1000)
    if (Number.isNaN(resetDate.getTime())) {
      return ''
    }

    return `${resetDate.toISOString().slice(11, 16)} UTC`
  }

  const setRateMetadata = rateLimit => {
    if (!rateNode) {
      return
    }

    const remaining = Number.isFinite(rateLimit?.remaining) ? rateLimit.remaining : null
    const resetText = formatResetTime(rateLimit?.resetEpochSeconds)

    if (remaining === null) {
      rateNode.textContent = 'Rate limit info unavailable'
      return
    }

    if (resetText) {
      rateNode.textContent = `Remaining ${remaining}, resets ${resetText}`
      return
    }

    rateNode.textContent = `Remaining ${remaining}`
  }

  const syncRepositoryLabel = () => {
    if (!repositoryNode) {
      return
    }

    repositoryNode.textContent = toRepositoryLabel(getSelectedRepository?.())
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
      return
    }

    for (const [index, message] of messages.entries()) {
      const item = document.createElement('article')
      item.className = `ai-chat-message ai-chat-message--${message.role}`

      const label = document.createElement('h3')
      label.className = 'ai-chat-message__label'
      label.textContent = message.role === 'assistant' ? 'Assistant' : 'You'

      item.append(label)

      const body = document.createElement('p')
      body.className = 'ai-chat-message__body'
      body.textContent = message.content
      item.append(body)

      if (message.role === 'assistant' && index === messages.length - 1) {
        lastAssistantBodyNode = body
      }

      if (message.level === 'error') {
        item.classList.add('ai-chat-message--error')
      }

      messagesNode.append(item)
    }

    messagesNode.scrollTop = messagesNode.scrollHeight
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

  const collectConversation = () => {
    return messages
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({
        role: message.role,
        content: message.content,
      }))
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

    const componentSource =
      typeof getComponentSource === 'function' ? toChatText(getComponentSource()) : ''
    const stylesSource =
      typeof getStylesSource === 'function' ? toChatText(getStylesSource()) : ''

    if (!componentSource && !stylesSource) {
      return null
    }

    const renderMode =
      typeof getRenderMode === 'function' ? toChatText(getRenderMode()) : ''
    const styleMode = typeof getStyleMode === 'function' ? toChatText(getStyleMode()) : ''

    return [
      'Editor context:',
      `- Render mode: ${renderMode || 'unknown'}`,
      `- Style mode: ${styleMode || 'unknown'}`,
      '',
      'Component editor source (JSX/TSX):',
      '```jsx',
      componentSource || '(empty)',
      '```',
      '',
      'Styles editor source:',
      '```css',
      stylesSource || '(empty)',
      '```',
    ].join('\n')
  }

  const setPendingState = isPending => {
    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = isPending
    }

    if (promptInput instanceof HTMLTextAreaElement) {
      promptInput.disabled = isPending
    }

    if (modelSelect instanceof HTMLSelectElement) {
      modelSelect.disabled = isPending
    }
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

    const repository = getSelectedRepository?.()
    if (!repository?.fullName) {
      setChatStatus('Select a writable repository before starting chat.', 'error')
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
    const outboundMessages = [
      { role: 'system', content: repositoryContext },
      ...(editorContext ? [{ role: 'system', content: editorContext }] : []),
      ...collectConversation(),
    ]

    let streamedContent = ''
    let streamSucceeded = false

    try {
      const streamResult = await streamGitHubChatCompletion({
        token,
        messages: outboundMessages,
        model: selectedModel,
        signal: requestSignal,
        onToken: tokenChunk => {
          streamedContent += tokenChunk
          updateLastAssistantMessage(streamedContent)
        },
      })

      streamSucceeded = true
      const streamedModel = toChatText(streamResult?.model)
      if (streamedModel) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant' && lastMessage.model !== streamedModel) {
          lastMessage.model = streamedModel
          renderMessages()
        }
      }
      setChatStatus('Response streamed from GitHub.', 'ok')
      setRateMetadata(streamResult?.rateLimit)
    } catch (streamError) {
      setRateMetadata(streamError?.rateLimit)
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
        signal: requestSignal,
      })

      updateLastAssistantMessage(fallbackResult.content)
      const fallbackModel = toChatText(fallbackResult.model)
      if (fallbackModel) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant' && lastMessage.model !== fallbackModel) {
          lastMessage.model = fallbackModel
          renderMessages()
        }
      }
      setChatStatus('Fallback response loaded.', 'ok')
      setRateMetadata(fallbackResult.rateLimit)
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

      setRateMetadata(fallbackError?.rateLimit)

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
  syncRepositoryLabel()
  renderMessages()
  setChatStatus('Idle', 'neutral')
  setRateMetadata(null)

  toggleButton?.addEventListener('click', () => {
    setOpen(!open)
  })

  closeButton?.addEventListener('click', () => {
    setOpen(false)
  })

  clearButton?.addEventListener('click', () => {
    stopPendingRequest()
    setPendingState(false)
    cancelPendingAssistantBodyUpdate()
    pendingAssistantBodyText = null
    messages.length = 0
    renderMessages()
    setRateMetadata(null)
    setChatStatus('Chat cleared.', 'neutral')
  })

  sendButton?.addEventListener('click', () => {
    void runChatRequest()
  })

  promptInput?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return
    }

    event.preventDefault()
    void runChatRequest()
  })

  const onDocumentKeydown = event => {
    if (event.key === 'Escape' && open) {
      setOpen(false)
    }
  }

  document.addEventListener('keydown', onDocumentKeydown)

  return {
    setOpen,
    isOpen: () => open,
    setSelectedRepository: () => {
      syncRepositoryLabel()
    },
    setToken: () => {},
    dispose: () => {
      stopPendingRequest()
      setPendingState(false)
      cancelPendingAssistantBodyUpdate()
      pendingAssistantBodyText = null
      document.removeEventListener('keydown', onDocumentKeydown)
    },
  }
}
