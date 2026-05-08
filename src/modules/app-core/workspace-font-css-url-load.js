const createApplyWorkspaceFontCssUrl = ({
  previewFont,
  flushWorkspaceSave,
  normalizePreviewFontCssUrl,
  defaultPreviewFontCssUrl,
}) => {
  return async fontCssUrl => {
    const requestedFontCssUrl = typeof fontCssUrl === 'string' ? fontCssUrl.trim() : ''
    const normalizedFontCssUrl = normalizePreviewFontCssUrl(requestedFontCssUrl)
    const defaultNormalizedFontCssUrl = normalizePreviewFontCssUrl(
      defaultPreviewFontCssUrl,
    )
    const rejectedInput =
      requestedFontCssUrl.length > 0 &&
      normalizedFontCssUrl === defaultNormalizedFontCssUrl &&
      requestedFontCssUrl !== defaultNormalizedFontCssUrl

    previewFont.applyPreviewFontCssUrl(requestedFontCssUrl, {
      emitChange: true,
      syncInputValue: true,
    })

    await flushWorkspaceSave({ preserveRecordId: true })

    return {
      ok: !rejectedInput,
      status: rejectedInput
        ? 'rejected'
        : requestedFontCssUrl !== normalizedFontCssUrl
          ? 'normalized'
          : 'loaded',
      requestedFontCssUrl,
      normalizedFontCssUrl,
    }
  }
}

export { createApplyWorkspaceFontCssUrl }
