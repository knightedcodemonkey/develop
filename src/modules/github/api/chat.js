import {
  defaultGitHubChatModel,
  githubChatModelOptions,
  githubModelsApiUrl,
} from './constants.js'
import {
  buildChatRequestHeaders,
  parseErrorResponse,
  parseRateMetadata,
  toApiError,
} from './core.js'

const normalizeChatMessage = message => {
  if (!message || typeof message !== 'object') {
    return null
  }

  const role =
    message.role === 'system' || message.role === 'assistant' ? message.role : 'user'
  const content = typeof message.content === 'string' ? message.content.trim() : ''

  if (!content) {
    return null
  }

  return { role, content }
}

const normalizeChatMessages = messages => {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map(normalizeChatMessage).filter(Boolean)
}

const normalizeToolChoice = toolChoice => {
  if (toolChoice === 'required' || toolChoice === 'none') {
    return toolChoice
  }

  return 'auto'
}

const normalizeToolDefinition = tool => {
  if (!tool || typeof tool !== 'object') {
    return null
  }

  if (tool.type !== 'function') {
    return null
  }

  const fn = tool.function
  if (!fn || typeof fn !== 'object') {
    return null
  }

  const name = typeof fn.name === 'string' ? fn.name.trim() : ''
  if (!name) {
    return null
  }

  const description =
    typeof fn.description === 'string' && fn.description.trim()
      ? fn.description.trim()
      : undefined
  const parameters =
    fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : undefined

  return {
    type: 'function',
    function: {
      name,
      ...(description ? { description } : {}),
      ...(parameters ? { parameters } : {}),
    },
  }
}

const normalizeToolDefinitions = tools => {
  if (!Array.isArray(tools)) {
    return []
  }

  return tools.map(normalizeToolDefinition).filter(Boolean)
}

const buildChatBody = ({ model, messages, stream, tools, toolChoice }) => {
  const normalizedMessages = normalizeChatMessages(messages)
  const normalizedTools = normalizeToolDefinitions(tools)

  const body = {
    model,
    messages: normalizedMessages,
    stream,
  }

  if (normalizedTools.length > 0) {
    body.tools = normalizedTools
    body.tool_choice = normalizeToolChoice(toolChoice)
  }

  return body
}

const normalizeToolCall = toolCall => {
  if (!toolCall || typeof toolCall !== 'object') {
    return null
  }

  const fn = toolCall.function
  const name = typeof fn?.name === 'string' ? fn.name.trim() : ''
  if (!name) {
    return null
  }

  const argumentsText =
    typeof fn?.arguments === 'string' && fn.arguments.trim() ? fn.arguments : '{}'

  return {
    id: typeof toolCall.id === 'string' ? toolCall.id : '',
    name,
    arguments: argumentsText,
  }
}

const extractToolCallsFromMessage = message => {
  if (!message || typeof message !== 'object') {
    return []
  }

  if (!Array.isArray(message.tool_calls)) {
    return []
  }

  return message.tool_calls.map(normalizeToolCall).filter(Boolean)
}

const extractContentFromMessage = message => {
  if (!message || typeof message !== 'object') {
    return ''
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (!Array.isArray(message.content)) {
    return ''
  }

  return message.content
    .map(part => {
      if (typeof part === 'string') {
        return part
      }

      if (
        part &&
        typeof part === 'object' &&
        part.type === 'text' &&
        typeof part.text === 'string'
      ) {
        return part.text
      }

      return ''
    })
    .join('')
}

const extractChatCompletionText = body => {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null

  if (!firstChoice || typeof firstChoice !== 'object') {
    return ''
  }

  const message = firstChoice.message
  return extractContentFromMessage(message).trim()
}

const extractChatCompletionToolCalls = body => {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null

  if (!firstChoice || typeof firstChoice !== 'object') {
    return []
  }

  return extractToolCallsFromMessage(firstChoice.message)
}

const extractStreamingDeltaText = body => {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null

  if (!firstChoice || typeof firstChoice !== 'object') {
    return ''
  }

  if (typeof firstChoice.delta?.content === 'string') {
    return firstChoice.delta.content
  }

  return ''
}

const collectStreamingToolCalls = ({ body, callsByIndex, orderedCalls }) => {
  const firstChoice = Array.isArray(body?.choices) ? body.choices[0] : null
  const deltas = Array.isArray(firstChoice?.delta?.tool_calls)
    ? firstChoice.delta.tool_calls
    : []

  for (const delta of deltas) {
    const index = Number.isFinite(delta?.index) ? delta.index : orderedCalls.length
    const key = String(index)
    const existing = callsByIndex.get(key) ?? {
      id: '',
      name: '',
      arguments: '',
    }

    if (typeof delta?.id === 'string' && delta.id.trim()) {
      existing.id = delta.id
    }

    const fn = delta?.function
    if (typeof fn?.name === 'string' && fn.name.trim()) {
      existing.name = fn.name
    }

    if (typeof fn?.arguments === 'string') {
      existing.arguments += fn.arguments
    }

    callsByIndex.set(key, existing)
  }

  orderedCalls.length = 0
  const sortedEntries = [...callsByIndex.entries()].sort(
    (left, right) => Number(left[0]) - Number(right[0]),
  )

  for (const [, call] of sortedEntries) {
    const normalizedCall = normalizeToolCall({
      id: call.id,
      function: {
        name: call.name,
        arguments: call.arguments,
      },
    })

    if (normalizedCall) {
      orderedCalls.push(normalizedCall)
    }
  }
}

const parseSseDataLine = line => {
  if (typeof line !== 'string') {
    return null
  }

  const trimmedLine = line.trim()
  if (!trimmedLine.startsWith('data:')) {
    return null
  }

  const payload = trimmedLine.slice(5).trim()
  if (!payload || payload === '[DONE]') {
    return null
  }

  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

const streamGitHubChatCompletion = async ({
  token,
  messages,
  signal,
  onToken,
  model = defaultGitHubChatModel,
  tools,
  toolChoice,
}) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to start a chat request.')
  }

  const normalizedMessages = normalizeChatMessages(messages)
  if (normalizedMessages.length === 0) {
    throw new Error('At least one message is required to start a chat request.')
  }

  const response = await fetch(githubModelsApiUrl, {
    method: 'POST',
    headers: buildChatRequestHeaders({ token, stream: true }),
    body: JSON.stringify(
      buildChatBody({
        model,
        messages: normalizedMessages,
        stream: true,
        tools,
        toolChoice,
      }),
    ),
    signal,
  })

  if (!response.ok) {
    const { message, rateLimit } = await parseErrorResponse(response)
    throw toApiError({ message, rateLimit })
  }

  if (!response.body) {
    throw new Error('Streaming response body is not available in this browser.')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffered = ''
  let combined = ''
  let responseModel = ''
  const streamingToolCallsByIndex = new Map()
  const streamingToolCalls = []

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''

    for (const line of lines) {
      const body = parseSseDataLine(line)
      if (!body) {
        continue
      }

      if (!responseModel && typeof body.model === 'string') {
        responseModel = body.model
      }

      collectStreamingToolCalls({
        body,
        callsByIndex: streamingToolCallsByIndex,
        orderedCalls: streamingToolCalls,
      })

      const chunk = extractStreamingDeltaText(body)
      if (!chunk) {
        continue
      }

      combined += chunk
      onToken?.(chunk)
    }
  }

  if (buffered.trim()) {
    const body = parseSseDataLine(buffered)
    if (body && !responseModel && typeof body.model === 'string') {
      responseModel = body.model
    }
    if (body) {
      collectStreamingToolCalls({
        body,
        callsByIndex: streamingToolCallsByIndex,
        orderedCalls: streamingToolCalls,
      })
    }
    const chunk = body ? extractStreamingDeltaText(body) : ''
    if (chunk) {
      combined += chunk
      onToken?.(chunk)
    }
  }

  if (!combined.trim() && streamingToolCalls.length === 0) {
    throw new Error('Streaming response did not include assistant content.')
  }

  return {
    content: combined,
    toolCalls: streamingToolCalls,
    model: responseModel || model,
    rateLimit: parseRateMetadata({ headers: response.headers, body: null }),
  }
}

const requestGitHubChatCompletion = async ({
  token,
  messages,
  signal,
  model = defaultGitHubChatModel,
  tools,
  toolChoice,
}) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('A GitHub token is required to start a chat request.')
  }

  const normalizedMessages = normalizeChatMessages(messages)
  if (normalizedMessages.length === 0) {
    throw new Error('At least one message is required to start a chat request.')
  }

  const response = await fetch(githubModelsApiUrl, {
    method: 'POST',
    headers: buildChatRequestHeaders({ token, stream: false }),
    body: JSON.stringify(
      buildChatBody({
        model,
        messages: normalizedMessages,
        stream: false,
        tools,
        toolChoice,
      }),
    ),
    signal,
  })

  if (!response.ok) {
    const { message, rateLimit } = await parseErrorResponse(response)
    throw toApiError({ message, rateLimit })
  }

  const body = await response.json()
  const content = extractChatCompletionText(body)
  const toolCalls = extractChatCompletionToolCalls(body)

  if (!content && toolCalls.length === 0) {
    throw new Error('GitHub chat response did not include assistant content.')
  }

  return {
    content,
    toolCalls,
    model: typeof body?.model === 'string' && body.model ? body.model : model,
    rateLimit: parseRateMetadata({ headers: response.headers, body }),
  }
}

export {
  defaultGitHubChatModel,
  githubChatModelOptions,
  requestGitHubChatCompletion,
  streamGitHubChatCompletion,
}
