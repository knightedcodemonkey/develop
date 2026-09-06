import { defaultChatModel } from './api/completions.js'

export const toChatText = value => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

export const toModelId = value => {
  if (typeof value !== 'string') {
    return defaultChatModel
  }

  const model = value.trim()
  return model || defaultChatModel
}

export const isModelAccessError = error => {
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

export const formatModelAccessErrorMessage = selectedModel => {
  const model = toModelId(selectedModel)
  return `Selected model "${model}" is not available for this key. Choose a different model.`
}

export const isModelAccessStatusMessage = value => {
  if (typeof value !== 'string') {
    return false
  }

  return (
    value.startsWith('Selected model "') && value.includes('not available for this key')
  )
}

export const toRepositoryLabel = repository => {
  if (!repository || typeof repository !== 'object') {
    return 'No repository selected'
  }

  if (typeof repository.fullName === 'string' && repository.fullName.trim()) {
    return repository.fullName
  }

  return 'No repository selected'
}

export const toRepositoryUrl = repository => {
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
