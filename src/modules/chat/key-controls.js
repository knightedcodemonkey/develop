import {
  clearOpenRouterKey,
  loadOpenRouterKey,
  maskOpenRouterKey,
  saveOpenRouterKey,
} from './key-store.js'

export const createChatKeyControls = ({
  root,
  input,
  addButton,
  deleteButton,
  onKeyChange,
}) => {
  let savedKey = loadOpenRouterKey()

  const hasKey = () => typeof savedKey === 'string' && savedKey.trim().length > 0

  const syncFieldState = () => {
    const keyPresent = hasKey()

    if (root instanceof HTMLElement) {
      root.dataset.keyState = keyPresent ? 'present' : 'missing'
    }

    if (input instanceof HTMLInputElement) {
      input.value = keyPresent ? maskOpenRouterKey(savedKey) : ''
      input.readOnly = keyPresent
      input.disabled = keyPresent
      input.dataset.keyState = keyPresent ? 'locked' : 'editable'
    }

    if (addButton instanceof HTMLButtonElement) {
      addButton.hidden = keyPresent
    }

    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.hidden = !keyPresent
    }
  }

  const emitKeyChange = () => {
    if (typeof onKeyChange === 'function') {
      onKeyChange(savedKey)
    }
  }

  const handleAdd = () => {
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    const nextKey = input.value.trim()
    if (!nextKey) {
      return
    }

    if (!saveOpenRouterKey(nextKey)) {
      return
    }

    savedKey = nextKey
    syncFieldState()
    emitKeyChange()
  }

  const handleDelete = () => {
    clearOpenRouterKey()
    savedKey = null
    syncFieldState()
    emitKeyChange()
  }

  const handleKeydown = event => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    handleAdd()
  }

  addButton?.addEventListener('click', handleAdd)
  deleteButton?.addEventListener('click', handleDelete)
  input?.addEventListener('keydown', handleKeydown)

  syncFieldState()

  return {
    getKey: () => savedKey,
    hasKey,
    dispose: () => {
      addButton?.removeEventListener('click', handleAdd)
      deleteButton?.removeEventListener('click', handleDelete)
      input?.removeEventListener('keydown', handleKeydown)
    },
  }
}
