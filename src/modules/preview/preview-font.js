import { defaultFontCssUrl, normalizeFontCssUrl } from '../font-css-url.js'

const systemSansFontFamily =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const defaultPreviewFontCssUrl = defaultFontCssUrl

const normalizePreviewFontCssUrl = value =>
  normalizeFontCssUrl(value, { fallback: defaultPreviewFontCssUrl })

const decodeGoogleFontsFamilyName = value => {
  if (typeof value !== 'string' || value.length === 0) {
    return ''
  }

  const plusDecoded = value.replace(/\+/g, ' ')
  const firstFamilySegment = plusDecoded.split('|')[0] || ''
  const withoutAxes = firstFamilySegment.split(':')[0] || ''
  try {
    return decodeURIComponent(withoutAxes).trim()
  } catch {
    return withoutAxes.trim()
  }
}

const resolvePreviewFontFamily = cssUrl => {
  const normalizedCssUrl = normalizePreviewFontCssUrl(cssUrl)
  if (!normalizedCssUrl) {
    return systemSansFontFamily
  }

  try {
    const parsed = new URL(normalizedCssUrl)
    const familyParams = parsed.searchParams.getAll('family')
    for (const familyParam of familyParams) {
      const decodedFamilyName = decodeGoogleFontsFamilyName(familyParam)
      if (!decodedFamilyName) {
        continue
      }

      const escapedFamilyName = decodedFamilyName.replace(/"/g, '\\"')
      return `"${escapedFamilyName}", ${systemSansFontFamily}`
    }
  } catch {
    return systemSansFontFamily
  }

  return systemSansFontFamily
}

export const createPreviewFontController = ({
  previewFontCssUrlInput,
  getDefaultPreviewFontCssUrl,
  onFontConfigChange,
}) => {
  let previewFontCssUrl = defaultPreviewFontCssUrl

  const applyPreviewFontCssUrl = (
    cssUrl,
    { emitChange = true, syncInputValue = true } = {},
  ) => {
    const normalizedCssUrl = normalizePreviewFontCssUrl(cssUrl)
    previewFontCssUrl = normalizedCssUrl

    if (
      syncInputValue &&
      previewFontCssUrlInput instanceof HTMLInputElement &&
      previewFontCssUrlInput.value !== normalizedCssUrl
    ) {
      previewFontCssUrlInput.value = normalizedCssUrl
    }

    if (emitChange && typeof onFontConfigChange === 'function') {
      onFontConfigChange({
        fontCssUrl: normalizedCssUrl,
        fontFamily: resolvePreviewFontFamily(normalizedCssUrl),
      })
    }
  }

  const initializePreviewFontInput = () => {
    if (!(previewFontCssUrlInput instanceof HTMLInputElement)) {
      return
    }

    const initialCssUrl =
      typeof getDefaultPreviewFontCssUrl === 'function'
        ? normalizePreviewFontCssUrl(getDefaultPreviewFontCssUrl())
        : defaultPreviewFontCssUrl

    applyPreviewFontCssUrl(initialCssUrl, {
      emitChange: true,
      syncInputValue: true,
    })

    previewFontCssUrlInput.addEventListener('change', () => {
      applyPreviewFontCssUrl(previewFontCssUrlInput.value, {
        emitChange: true,
        syncInputValue: true,
      })
    })
  }

  return {
    applyPreviewFontCssUrl,
    getPreviewFontCssUrl: () => previewFontCssUrl,
    getPreviewFontFamily: () => resolvePreviewFontFamily(previewFontCssUrl),
    initializePreviewFontInput,
  }
}

export {
  defaultPreviewFontCssUrl,
  normalizePreviewFontCssUrl,
  resolvePreviewFontFamily,
  systemSansFontFamily,
}
