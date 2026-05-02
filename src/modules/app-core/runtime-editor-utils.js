const getStyleEditorLanguage = mode => {
  if (mode === 'less') return 'less'
  if (mode === 'sass') return 'sass'
  return 'css'
}

const normalizeRenderMode = mode => (mode === 'react' ? 'react' : 'dom')

const updateRenderModeEditability = ({ renderMode, getActiveWorkspaceTab }) => {
  if (!(renderMode instanceof HTMLSelectElement)) {
    return
  }

  const activeTab = getActiveWorkspaceTab()
  const isEntryTab = activeTab?.role === 'entry'
  renderMode.disabled = !isEntryTab
}

const normalizeStyleMode = mode => {
  if (mode === 'module') return 'module'
  if (mode === 'less') return 'less'
  if (mode === 'sass') return 'sass'
  return 'css'
}

const setJsxSourceValue = ({
  value,
  jsxCodeEditor,
  setSuppressEditorChangeSideEffects,
  jsxEditor,
}) => {
  if (jsxCodeEditor) {
    setSuppressEditorChangeSideEffects(true)
    try {
      jsxCodeEditor.setValue(value)
    } finally {
      setSuppressEditorChangeSideEffects(false)
    }
  }
  jsxEditor.value = value
}

const setCssSourceValue = ({
  value,
  cssCodeEditor,
  setSuppressEditorChangeSideEffects,
  cssEditor,
}) => {
  if (cssCodeEditor) {
    setSuppressEditorChangeSideEffects(true)
    try {
      cssCodeEditor.setValue(value)
    } finally {
      setSuppressEditorChangeSideEffects(false)
    }
  }
  cssEditor.value = value
}

export {
  getStyleEditorLanguage,
  normalizeRenderMode,
  normalizeStyleMode,
  setCssSourceValue,
  setJsxSourceValue,
  updateRenderModeEditability,
}
