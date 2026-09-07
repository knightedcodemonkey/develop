import { chatModelOptions, defaultChatModel, isFreeChatModel } from './api/constants.js'
import { fetchChatModelOptions } from './api/models.js'
import { toModelId } from './utils.js'

export const createChatModelPicker = ({
  modelSelect,
  getChatKey,
  resetModelAccessStatus,
}) => {
  let loadedCatalogToken = null
  let pendingCatalogLoadPromise = null

  const setModelSelectDisabled = isDisabled => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return
    }

    modelSelect.disabled = isDisabled
  }

  const replaceModelOptions = ({ modelOptions, selectedModel }) => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return
    }

    const nextSelectedModel = toModelId(selectedModel)
    const nextModelOptions = [
      { id: defaultChatModel, isFree: true },
      ...modelOptions.filter(option => option.id !== defaultChatModel),
    ].filter(
      (option, index, options) =>
        options.findIndex(candidate => candidate.id === option.id) === index,
    )
    const freeModelOptions = []
    const paidModelOptions = []

    for (const modelOption of nextModelOptions) {
      if (modelOption.isFree) {
        freeModelOptions.push(modelOption)
      } else {
        paidModelOptions.push(modelOption)
      }
    }

    modelSelect.replaceChildren()

    const appendGroupedOptions = (label, options) => {
      if (options.length === 0) {
        return
      }

      const group = document.createElement('optgroup')
      group.label = label

      for (const { id: modelId } of options) {
        const option = document.createElement('option')
        option.value = modelId
        option.textContent = modelId
        option.selected = modelId === nextSelectedModel
        group.append(option)
      }

      modelSelect.append(group)
    }

    appendGroupedOptions('Free', freeModelOptions)
    appendGroupedOptions('Paid', paidModelOptions)

    if (!nextModelOptions.some(option => option.id === nextSelectedModel)) {
      modelSelect.value = defaultChatModel
    }
  }

  const getSelectedModel = () => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return defaultChatModel
    }

    return toModelId(modelSelect.value)
  }

  const initializeModelOptions = () => {
    replaceModelOptions({
      modelOptions: chatModelOptions.map(id => ({
        id,
        isFree: isFreeChatModel(id),
      })),
      selectedModel: defaultChatModel,
    })
  }

  const loadModelOptionsFromCatalog = async ({ force = false } = {}) => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return
    }

    const token = getChatKey()
    const normalizedToken = typeof token === 'string' ? token.trim() : ''

    if (!normalizedToken) {
      return
    }

    if (!force && pendingCatalogLoadPromise) {
      await pendingCatalogLoadPromise
      return
    }

    if (!force && loadedCatalogToken === normalizedToken) {
      return
    }

    const loadCatalog = async () => {
      try {
        const modelOptions = await fetchChatModelOptions({ token: normalizedToken })
        const selectedModel = getSelectedModel()
        replaceModelOptions({
          modelOptions,
          selectedModel,
        })
        loadedCatalogToken = normalizedToken
      } catch {
        /* Keep fallback options when catalog loading fails. */
      }
    }

    const catalogLoadPromise = loadCatalog()

    pendingCatalogLoadPromise = catalogLoadPromise

    try {
      await catalogLoadPromise
    } finally {
      if (pendingCatalogLoadPromise === catalogLoadPromise) {
        pendingCatalogLoadPromise = null
      }
    }
  }

  const syncModelSelectionForKey = key => {
    const keyPresent = typeof key === 'string' && key.trim().length > 0

    setModelSelectDisabled(!keyPresent)

    if (!keyPresent && modelSelect instanceof HTMLSelectElement) {
      modelSelect.value = defaultChatModel
    }

    if (keyPresent) {
      resetModelAccessStatus?.()
    }
  }

  const invalidateCatalogCache = () => {
    loadedCatalogToken = null
  }

  return {
    getSelectedModel,
    initializeModelOptions,
    loadModelOptionsFromCatalog,
    syncModelSelectionForKey,
    invalidateCatalogCache,
  }
}
