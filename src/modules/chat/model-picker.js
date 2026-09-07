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

  const replaceModelOptions = ({ modelIds, selectedModel }) => {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return
    }

    const nextSelectedModel = toModelId(selectedModel)
    const nextModelIds = [...new Set([defaultChatModel, ...modelIds])]
    const freeModelIds = []
    const paidModelIds = []

    for (const modelId of nextModelIds) {
      if (isFreeChatModel(modelId)) {
        freeModelIds.push(modelId)
      } else {
        paidModelIds.push(modelId)
      }
    }

    modelSelect.replaceChildren()

    const appendGroupedOptions = (label, ids) => {
      if (ids.length === 0) {
        return
      }

      const group = document.createElement('optgroup')
      group.label = label

      for (const modelId of ids) {
        const option = document.createElement('option')
        option.value = modelId
        option.textContent = modelId
        option.selected = modelId === nextSelectedModel
        group.append(option)
      }

      modelSelect.append(group)
    }

    appendGroupedOptions('Free', freeModelIds)
    appendGroupedOptions('Paid', paidModelIds)

    if (!nextModelIds.includes(nextSelectedModel)) {
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
      modelIds: chatModelOptions,
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

    const selectedModel = getSelectedModel()
    const catalogLoadPromise = fetchChatModelOptions({ token: normalizedToken })
      .then(modelIds => {
        replaceModelOptions({
          modelIds,
          selectedModel,
        })
        loadedCatalogToken = normalizedToken
      })
      .catch(() => {
        /* Keep fallback options when catalog loading fails. */
      })
      .finally(() => {
        if (pendingCatalogLoadPromise === catalogLoadPromise) {
          pendingCatalogLoadPromise = null
        }
      })

    pendingCatalogLoadPromise = catalogLoadPromise
    await catalogLoadPromise
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
