import { toChatText } from './chat-utils.js'

export const editorProposalTools = [
  {
    type: 'function',
    function: {
      name: 'propose_editor_update',
      description:
        'Propose a single editor update for component or styles with full replacement content.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['component', 'styles'],
          },
          content: {
            type: 'string',
            description: 'Full replacement text for the target editor.',
          },
          rationale: {
            type: 'string',
            description: 'Short explanation for the proposed change.',
          },
        },
        required: ['target', 'content'],
        additionalProperties: false,
      },
    },
  },
]

const parseJsonSafe = value => {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const extractEditorProposalsFromToolCalls = toolCalls => {
  const proposals = {
    component: null,
    styles: null,
  }

  if (!Array.isArray(toolCalls)) {
    return proposals
  }

  for (const toolCall of toolCalls) {
    if (!toolCall || toolCall.name !== 'propose_editor_update') {
      continue
    }

    const payload = parseJsonSafe(toolCall.arguments)
    if (!payload || typeof payload !== 'object') {
      continue
    }

    const target =
      payload.target === 'component' || payload.target === 'styles'
        ? payload.target
        : null
    const content = toChatText(payload.content)
    const rationale = toChatText(payload.rationale)

    if (!target || !content) {
      continue
    }

    proposals[target] = {
      source: 'tool',
      content,
      rationale,
    }
  }

  return proposals
}

const extractEditorProposalsFromMarkdown = content => {
  const proposals = {
    component: null,
    styles: null,
  }

  if (typeof content !== 'string' || !content.trim()) {
    return proposals
  }

  const blockRegex = /```(jsx|tsx|css)\n([\s\S]*?)```/gi
  let match = blockRegex.exec(content)

  while (match) {
    const language = match[1]?.toLowerCase()
    const blockContent = toChatText(match[2])

    if (blockContent) {
      if ((language === 'jsx' || language === 'tsx') && !proposals.component) {
        proposals.component = {
          source: 'markdown',
          content: blockContent,
          rationale: '',
        }
      }

      if (language === 'css' && !proposals.styles) {
        proposals.styles = {
          source: 'markdown',
          content: blockContent,
          rationale: '',
        }
      }
    }

    match = blockRegex.exec(content)
  }

  return proposals
}

export const toMessageEditorProposals = message => {
  const fromToolCalls = extractEditorProposalsFromToolCalls(message?.toolCalls)

  if (fromToolCalls.component || fromToolCalls.styles) {
    return fromToolCalls
  }

  return extractEditorProposalsFromMarkdown(message?.content)
}
