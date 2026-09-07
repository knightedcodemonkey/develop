import { requestChatCompletion, streamChatCompletion } from './api/completions.js'
import { shouldEnableEditorUpdateTools } from './payload.js'
import { editorProposalTools } from './proposals.js'
import {
  formatModelAccessErrorMessage,
  isCredentialError,
  isModelAccessError,
  toChatText,
} from './utils.js'

export const createChatRequestRunner = ({
  getPrompt,
  getToken,
  getSelectedModel,
  isEditorsContextIncluded,
  stopPendingRequest,
  setPendingAbortController,
  getPendingAbortController,
  appendMessage,
  clearPrompt,
  setPendingState,
  setChatStatus,
  buildOutboundMessages,
  updateLastAssistantMessage,
  attachAssistantResponseMetadata,
  markLastAssistantError,
  setLastAssistantModel,
}) => {
  const runChatRequest = async () => {
    const prompt = toChatText(getPrompt?.())

    if (!prompt) {
      setChatStatus?.('Enter a prompt before sending.', 'error')
      return
    }

    const token = getToken?.()
    if (!token) {
      setChatStatus?.('Add an OpenRouter API key before starting chat.', 'error')
      return
    }

    const selectedModel = getSelectedModel?.()
    const allowEditorUpdateTools =
      isEditorsContextIncluded?.() === true && shouldEnableEditorUpdateTools(prompt)

    stopPendingRequest?.()
    const requestAbortController = new AbortController()
    const requestSignal = requestAbortController.signal
    setPendingAbortController?.(requestAbortController)

    appendMessage?.({ role: 'user', content: prompt })
    appendMessage?.({
      role: 'assistant',
      content: '',
      model: selectedModel,
      allowApplyActions: allowEditorUpdateTools,
    })

    clearPrompt?.()
    setPendingState?.(true)
    setChatStatus?.('Streaming response...', 'pending')

    const outboundMessages = buildOutboundMessages?.() ?? []
    const toolChoice = allowEditorUpdateTools ? 'auto' : 'none'
    const tools = allowEditorUpdateTools ? editorProposalTools : []

    let streamedContent = ''
    let streamSucceeded = false

    try {
      const streamResult = await streamChatCompletion({
        token,
        messages: outboundMessages,
        model: selectedModel,
        tools,
        toolChoice,
        signal: requestSignal,
        onToken: tokenChunk => {
          streamedContent += tokenChunk
          updateLastAssistantMessage?.(streamedContent)
        },
      })

      streamSucceeded = true
      const streamedModel = toChatText(streamResult?.model)
      const streamContent = toChatText(streamResult?.content)
      attachAssistantResponseMetadata?.({
        content: streamContent,
        toolCalls: streamResult?.toolCalls,
        model: streamedModel,
      })
      setChatStatus?.('Response streamed.', 'ok')
    } catch (streamError) {
      if (requestSignal.aborted) {
        if (getPendingAbortController?.() === requestAbortController) {
          setChatStatus?.('Chat request canceled.', 'neutral')
          setPendingAbortController?.(null)
          setPendingState?.(false)
        }
        return
      }

      if (isModelAccessError(streamError)) {
        const modelAccessMessage = formatModelAccessErrorMessage(selectedModel)
        markLastAssistantError?.(modelAccessMessage)
        setChatStatus?.(modelAccessMessage, 'error')

        if (getPendingAbortController?.() === requestAbortController) {
          setPendingAbortController?.(null)
          setPendingState?.(false)
        }
        return
      }

      if (isCredentialError(streamError)) {
        const credentialMessage =
          streamError instanceof Error ? streamError.message : 'Chat request failed.'

        markLastAssistantError?.(credentialMessage)
        setChatStatus?.(credentialMessage, 'error')

        if (getPendingAbortController?.() === requestAbortController) {
          setPendingAbortController?.(null)
          setPendingState?.(false)
        }
        return
      }

      const streamStatus = streamError?.status
      if (typeof streamStatus === 'number' && streamStatus >= 400 && streamStatus < 500) {
        const streamMessage =
          streamError instanceof Error ? streamError.message : 'Chat request failed.'

        markLastAssistantError?.(streamMessage)
        setChatStatus?.(streamMessage, 'error')

        if (getPendingAbortController?.() === requestAbortController) {
          setPendingAbortController?.(null)
          setPendingState?.(false)
        }

        return
      }

      setChatStatus?.(
        'Streaming unavailable. Retrying with fallback response...',
        'pending',
      )
    }

    if (streamSucceeded) {
      if (getPendingAbortController?.() === requestAbortController) {
        setPendingAbortController?.(null)
        setPendingState?.(false)
      }
      return
    }

    try {
      const fallbackResult = await requestChatCompletion({
        token,
        messages: outboundMessages,
        model: selectedModel,
        tools,
        toolChoice,
        signal: requestSignal,
      })

      attachAssistantResponseMetadata?.({
        content: toChatText(fallbackResult.content),
        toolCalls: fallbackResult?.toolCalls,
      })
      const fallbackModel = toChatText(fallbackResult.model)
      setLastAssistantModel?.(fallbackModel)
      setChatStatus?.('Fallback response loaded.', 'ok')
    } catch (fallbackError) {
      if (requestSignal.aborted) {
        if (getPendingAbortController?.() === requestAbortController) {
          setChatStatus?.('Chat request canceled.', 'neutral')
        }
        return
      }

      const fallbackMessage = isModelAccessError(fallbackError)
        ? formatModelAccessErrorMessage(selectedModel)
        : fallbackError instanceof Error
          ? fallbackError.message
          : 'Chat request failed.'

      markLastAssistantError?.(fallbackMessage)
      setChatStatus?.(`Chat request failed: ${fallbackMessage}`, 'error')
    } finally {
      if (getPendingAbortController?.() === requestAbortController) {
        setPendingAbortController?.(null)
        setPendingState?.(false)
      }
    }
  }

  return {
    runChatRequest,
  }
}
