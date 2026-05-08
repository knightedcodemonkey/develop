const createPreviewFontSetup = ({
  createPreviewFontController,
  previewFontCssUrlInput,
  defaultPreviewFontCssUrl,
  getRenderRuntime,
  queueWorkspaceSave,
}) => {
  return createPreviewFontController({
    previewFontCssUrlInput,
    getDefaultPreviewFontCssUrl: () => defaultPreviewFontCssUrl,
    onFontConfigChange: ({ fontCssUrl, fontFamily }) => {
      const renderRuntime =
        typeof getRenderRuntime === 'function' ? getRenderRuntime() : null
      if (renderRuntime && typeof renderRuntime.updatePreviewFont === 'function') {
        renderRuntime.updatePreviewFont({ fontCssUrl, fontFamily })
      }

      if (typeof queueWorkspaceSave === 'function') {
        queueWorkspaceSave()
      }
    },
  })
}

export { createPreviewFontSetup }
