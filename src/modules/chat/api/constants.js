export const chatCompletionsUrl = 'https://openrouter.ai/api/v1/chat/completions'
export const chatModelsUrl = 'https://openrouter.ai/api/v1/models'
export const openRouterKeysUrl = 'https://openrouter.ai/keys'

/* The free router auto-selects a free model, so it survives free-slug churn. */
export const defaultChatModel = 'openrouter/free'

/*
 * Fallback catalog for when the live model list is unavailable. Every entry is
 * tool-capable, since editor proposals depend on tool calling.
 */
export const chatModelOptions = [
  'openrouter/free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'minimax/minimax-m3:free',
  'google/gemma-4-31b-it:free',
  'thinkingmachines/inkling:free',
  'openai/gpt-6-astra',
  'anthropic/claude-sonnet-5',
  'google/gemini-3.8-flash',
  'deepseek/deepseek-v4-flash-0731',
]

export const isFreeChatModel = model =>
  typeof model === 'string' && (model === 'openrouter/free' || model.endsWith(':free'))
