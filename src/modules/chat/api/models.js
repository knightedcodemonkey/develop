import { chatModelOptions, chatModelsUrl, defaultChatModel } from './constants.js'

const toText = value => (typeof value === 'string' ? value.trim() : '')

const supportsTools = model => {
  const supportedParameters = Array.isArray(model?.supported_parameters)
    ? model.supported_parameters
    : []

  return supportedParameters.some(parameter =>
    typeof parameter === 'string' ? parameter.toLowerCase() === 'tools' : false,
  )
}

const isFreeModel = model => {
  const pricing = model?.pricing
  if (!pricing || typeof pricing !== 'object') {
    return false
  }

  return pricing.prompt === '0' && pricing.completion === '0'
}

const sortModelEntries = entries => {
  return [...entries].sort((left, right) => {
    if (left.isFree !== right.isFree) {
      return left.isFree ? -1 : 1
    }

    return left.id.localeCompare(right.id)
  })
}

const normalizeModelOptions = models => {
  const normalizedModels = Array.isArray(models) ? models : []
  const byModelId = new Map()

  for (const model of normalizedModels) {
    const modelId = toText(model?.id)
    if (!modelId || !supportsTools(model)) {
      continue
    }

    byModelId.set(modelId, {
      id: modelId,
      isFree: isFreeModel(model),
    })
  }

  const sortedModelIds = sortModelEntries(Array.from(byModelId.values())).map(
    entry => entry.id,
  )

  if (sortedModelIds.length === 0) {
    return chatModelOptions
  }

  return [...new Set([defaultChatModel, ...sortedModelIds])]
}

const buildCatalogRequestHeaders = token => {
  const normalizedToken = toText(token)
  if (!normalizedToken) {
    return undefined
  }

  return {
    Authorization: `Bearer ${normalizedToken}`,
  }
}

export const fetchChatModelOptions = async ({ token, signal } = {}) => {
  const response = await fetch(chatModelsUrl, {
    method: 'GET',
    headers: buildCatalogRequestHeaders(token),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Model catalog request failed with status ${response.status}`)
  }

  const body = await response.json()
  return normalizeModelOptions(body?.data)
}
