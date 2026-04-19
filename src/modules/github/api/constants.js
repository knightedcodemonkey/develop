export const githubApiBaseUrl = 'https://api.github.com'
export const githubModelsApiUrl = 'https://models.github.ai/inference/chat/completions'

export const defaultGitHubChatModel = 'openai/gpt-4.1-mini'

/* Local model options avoid browser CORS failures when calling catalog endpoints directly. */
export const githubChatModelOptions = [
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-5',
  'openai/gpt-5-chat',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'cohere/cohere-command-r-plus-08-2024',
  'deepseek/deepseek-v3-0324',
  'meta/llama-4-maverick-17b-128e-instruct-fp8',
  'meta/llama-4-scout-17b-16e-instruct',
  'mistral-ai/ministral-3b',
  'mistral-ai/mistral-medium-2505',
  'mistral-ai/mistral-small-2503',
]
