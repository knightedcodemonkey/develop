const createSourceSetters = ({
  setJsxSourceValue,
  setCssSourceValue,
  getJsxCodeEditor,
  getCssCodeEditor,
  setSuppressEditorChangeSideEffects,
  jsxEditor,
  cssEditor,
}) => {
  const setJsxSource = value => {
    setJsxSourceValue({
      value,
      jsxCodeEditor: getJsxCodeEditor(),
      setSuppressEditorChangeSideEffects,
      jsxEditor,
    })
  }

  const setCssSource = value => {
    setCssSourceValue({
      value,
      cssCodeEditor: getCssCodeEditor(),
      setSuppressEditorChangeSideEffects,
      cssEditor,
    })
  }

  return {
    setJsxSource,
    setCssSource,
  }
}

export { createSourceSetters }
