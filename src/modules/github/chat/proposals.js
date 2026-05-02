import { toChatText } from './utils.js'

export const editorProposalTools = [
  {
    type: 'function',
    function: {
      name: 'propose_editor_update',
      description:
        'Propose a single tab update with full replacement content for a target tab id or path.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Target tab id or tab path from the available tab list.',
          },
          content: {
            type: 'string',
            description: 'Full replacement text for the target tab.',
          },
          language: {
            type: 'string',
            description: 'Optional tab language hint such as javascript-jsx or css.',
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

const toTargetValue = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

const toProposalKey = value => toTargetValue(value).toLowerCase()

const extractEditorProposalsFromToolCalls = toolCalls => {
  const proposalsByKey = new Map()

  if (!Array.isArray(toolCalls)) {
    return []
  }

  for (const toolCall of toolCalls) {
    if (!toolCall || toolCall.name !== 'propose_editor_update') {
      continue
    }

    const payload = parseJsonSafe(toolCall.arguments)
    if (!payload || typeof payload !== 'object') {
      continue
    }

    const target = toTargetValue(payload.target)
    const content = toChatText(payload.content)
    const language = toChatText(payload.language)
    const rationale = toChatText(payload.rationale)
    const proposalKey = toProposalKey(target)

    if (!proposalKey || !content) {
      continue
    }

    proposalsByKey.set(proposalKey, {
      target,
      source: 'tool',
      content,
      language,
      rationale,
    })
  }

  return Array.from(proposalsByKey.values())
}

const extractEditorProposalsFromMarkdown = ({ content, fallbackTarget }) => {
  const target = toTargetValue(fallbackTarget)
  if (!target) {
    return []
  }

  if (typeof content !== 'string' || !content.trim()) {
    return []
  }

  const blockRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g
  const match = blockRegex.exec(content)
  if (!match) {
    return []
  }

  const language = toChatText(match[1]).toLowerCase()
  const blockContent = toChatText(match[2])
  if (!blockContent) {
    return []
  }

  return [
    {
      target,
      source: 'markdown',
      content: blockContent,
      language,
      rationale: '',
    },
  ]
}

export const toMessageEditorProposals = (message, { fallbackTarget = '' } = {}) => {
  const fromToolCalls = extractEditorProposalsFromToolCalls(message?.toolCalls)

  if (fromToolCalls.length > 0) {
    return fromToolCalls
  }

  return extractEditorProposalsFromMarkdown({
    content: message?.content,
    fallbackTarget,
  })
}
