import { toChatText } from './utils.js'

const chatByteBudget = 120_000
const chatMaxSummaryChars = 3_600
const chatMaxConversationMessages = 14
const systemPromptMessage = [
  'You are an expert software development assistant focused on CSS dialects and JSX syntax across React and native DOM APIs.',
  'Prioritize practical, safe, and minimal changes that fit the current project architecture.',
  'When proposing concrete editor edits, prefer tool calls so the user can explicitly review and apply changes.',
  'Do not assume framework migrations unless the user asks.',
].join(' ')

const toUtf8ByteLength = value => {
  const text = typeof value === 'string' ? value : ''
  return new TextEncoder().encode(text).length
}

const summarizeConversationSlice = messages => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return ''
  }

  const lines = []
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'Assistant' : 'User'
    const content = toChatText(message.content)
    if (!content) {
      continue
    }

    const clipped = content.length > 280 ? `${content.slice(0, 280)}...` : content
    lines.push(`- ${role}: ${clipped}`)
  }

  const summary = lines.join('\n').trim()
  if (!summary) {
    return ''
  }

  if (summary.length <= chatMaxSummaryChars) {
    return summary
  }

  return `${summary.slice(0, chatMaxSummaryChars)}...`
}

const mergeConversationSummary = ({ existingSummary, droppedMessages }) => {
  const droppedSummary = summarizeConversationSlice(droppedMessages)
  if (!droppedSummary) {
    return existingSummary
  }

  const merged = [existingSummary, droppedSummary].filter(Boolean).join('\n')
  if (merged.length <= chatMaxSummaryChars) {
    return merged
  }

  return `${merged.slice(0, chatMaxSummaryChars)}...`
}

const toModeDisplayText = value => {
  const mode = toChatText(value)
  return mode || 'unknown'
}

const toModeKey = value => toChatText(value).toLowerCase()

const collectModePolicyContext = ({ renderMode, styleMode }) => {
  const renderModeText = toModeDisplayText(renderMode)
  const styleModeText = toModeDisplayText(styleMode)
  const renderModeKey = toModeKey(renderMode)
  const styleModeKey = toModeKey(styleMode)

  const policyLines = [
    'Mode-aware policy:',
    `- Render mode: ${renderModeText}`,
    `- Style mode: ${styleModeText}`,
    '- Preserve the selected style dialect and avoid cross-dialect rewrites unless the user explicitly asks for conversion.',
  ]

  if (renderModeKey === 'dom') {
    policyLines.push(
      '- In DOM mode, avoid React hook/state guidance unless the user explicitly asks for React migration.',
    )
    policyLines.push(
      '- In DOM mode, JSX is compiled for @knighted/jsx DOM runtime and should not be treated as a React application by default.',
    )
    policyLines.push(
      '- Prefer native DOM APIs, event listeners, and direct browser-compatible patterns.',
    )
    policyLines.push(
      '- Do not suggest React imports, hooks, or React-only runtime APIs unless the user explicitly requests React mode or migration.',
    )
  }

  if (renderModeKey === 'react') {
    policyLines.push('- In React mode, prefer component-based React guidance.')
  }

  if (styleModeKey === 'css') {
    policyLines.push(
      '- Keep style advice compatible with plain CSS unless user asks for a preprocessor.',
    )
  }

  if (styleModeKey === 'module') {
    policyLines.push(
      '- In CSS modules mode, keep class names module-scoped and preserve CSS module semantics.',
    )
    policyLines.push(
      '- Avoid converting CSS modules files to global CSS unless the user explicitly asks.',
    )
  }

  if (styleModeKey === 'less') {
    policyLines.push(
      '- In Less mode, prefer Less-compatible syntax and avoid Sass-specific directives/features.',
    )
  }

  if (styleModeKey === 'sass') {
    policyLines.push(
      '- In Sass mode, prefer Sass/SCSS-compatible syntax and avoid Less-specific directives/features.',
    )
  }

  return policyLines.join('\n')
}

const collectSystemRolePrompt = ({ renderMode, styleMode }) => {
  return [systemPromptMessage, collectModePolicyContext({ renderMode, styleMode })].join(
    '\n\n',
  )
}

const collectConversation = messages => {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role,
      content: toChatText(message.content),
    }))
    .filter(message => Boolean(message.content))
}

export const buildOutboundMessages = ({
  messages,
  repositoryContext,
  editorContext,
  renderMode,
  styleMode,
  existingSummary,
}) => {
  const normalizedRepositoryContext = toChatText(repositoryContext)
  const systemMessages = [
    {
      role: 'system',
      content: collectSystemRolePrompt({ renderMode, styleMode }),
    },
    ...(normalizedRepositoryContext
      ? [{ role: 'system', content: normalizedRepositoryContext }]
      : []),
    ...(editorContext ? [{ role: 'system', content: editorContext }] : []),
  ]
  const conversation = collectConversation(messages)

  let retainedConversation = conversation.slice(-chatMaxConversationMessages)
  let droppedConversation = conversation.slice(
    0,
    Math.max(0, conversation.length - retainedConversation.length),
  )
  let nextSummary = existingSummary

  if (droppedConversation.length > 0) {
    nextSummary = mergeConversationSummary({
      existingSummary: nextSummary,
      droppedMessages: droppedConversation,
    })
  }

  let payloadMessages = [
    ...systemMessages,
    ...(nextSummary
      ? [
          {
            role: 'system',
            content: `Conversation summary of earlier turns:\n${nextSummary}`,
          },
        ]
      : []),
    ...retainedConversation,
  ]

  while (
    toUtf8ByteLength(JSON.stringify({ messages: payloadMessages })) > chatByteBudget &&
    retainedConversation.length > 2
  ) {
    droppedConversation = [...droppedConversation, retainedConversation.shift()]
    if (droppedConversation.length > 0) {
      nextSummary = mergeConversationSummary({
        existingSummary: nextSummary,
        droppedMessages: droppedConversation,
      })
      droppedConversation = []
    }

    payloadMessages = [
      ...systemMessages,
      ...(nextSummary
        ? [
            {
              role: 'system',
              content: `Conversation summary of earlier turns:\n${nextSummary}`,
            },
          ]
        : []),
      ...retainedConversation,
    ]
  }

  return {
    outboundMessages: payloadMessages,
    nextSummary,
  }
}
