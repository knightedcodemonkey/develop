const defaultLightPreviewBackgroundColor = '#ffffff'
const defaultDarkPreviewBackgroundColor = '#12141c'

const toHexChannel = value => value.toString(16).padStart(2, '0')

const normalizeColorToHex = colorValue => {
  if (typeof colorValue !== 'string' || colorValue.length === 0) {
    return defaultLightPreviewBackgroundColor
  }

  if (/^#[\da-f]{6}$/i.test(colorValue)) {
    return colorValue.toLowerCase()
  }

  if (/^#[\da-f]{3}$/i.test(colorValue)) {
    return colorValue
      .slice(1)
      .split('')
      .map(channel => channel + channel)
      .join('')
      .replace(/^/, '#')
      .toLowerCase()
  }

  const channels = colorValue.match(/\d+/g)
  if (!channels || channels.length < 3) {
    return defaultLightPreviewBackgroundColor
  }

  const [red, green, blue] = channels.slice(0, 3).map(value => Number.parseInt(value, 10))
  if ([red, green, blue].some(value => Number.isNaN(value))) {
    return defaultLightPreviewBackgroundColor
  }

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}

export const createPreviewBackgroundController = ({
  previewBgColorInput,
  getPreviewHost,
  getDefaultPreviewBackgroundColor,
}) => {
  let previewBackgroundColor = null
  let previewBackgroundCustomized = false

  const resolveDefaultPreviewBackgroundColor = () => {
    if (typeof getDefaultPreviewBackgroundColor === 'function') {
      const configuredColor = getDefaultPreviewBackgroundColor()
      if (typeof configuredColor === 'string' && configuredColor.length > 0) {
        return normalizeColorToHex(configuredColor)
      }
    }

    if (document.documentElement.dataset.theme === 'light') {
      return defaultLightPreviewBackgroundColor
    }

    return defaultDarkPreviewBackgroundColor
  }

  const applyPreviewBackgroundColor = color => {
    const previewHost = getPreviewHost()
    if (!previewHost) {
      return
    }

    const iframe = previewHost.querySelector('iframe')
    const iframeDocument = iframe?.contentDocument ?? null

    if (typeof color === 'string' && color.length > 0) {
      previewHost.style.backgroundColor = color
      previewHost.style.setProperty('--preview-iframe-background-color', color)

      if (iframeDocument) {
        iframeDocument.documentElement.style.backgroundColor = color
        iframeDocument.body.style.backgroundColor = color
      }
      return
    }

    previewHost.style.removeProperty('background-color')
    previewHost.style.removeProperty('--preview-iframe-background-color')

    if (iframeDocument) {
      iframeDocument.documentElement.style.removeProperty('background-color')
      iframeDocument.body.style.removeProperty('background-color')
    }
  }

  const syncPreviewBackgroundPickerFromTheme = () => {
    const previewHost = getPreviewHost()
    if (!previewBgColorInput || !previewHost || previewBackgroundCustomized) {
      return
    }

    const defaultPreviewBackgroundColor = resolveDefaultPreviewBackgroundColor()
    previewBackgroundColor = defaultPreviewBackgroundColor
    previewBgColorInput.value = defaultPreviewBackgroundColor
    applyPreviewBackgroundColor(defaultPreviewBackgroundColor)
  }

  const initializePreviewBackgroundPicker = () => {
    const previewHost = getPreviewHost()
    if (!previewBgColorInput || !previewHost) {
      return
    }

    const initialColor = resolveDefaultPreviewBackgroundColor()

    previewBackgroundColor = initialColor
    previewBackgroundCustomized = false
    previewBgColorInput.value = initialColor
    applyPreviewBackgroundColor(initialColor)

    previewBgColorInput.addEventListener('input', () => {
      previewBackgroundColor = previewBgColorInput.value
      previewBackgroundCustomized = true
      applyPreviewBackgroundColor(previewBackgroundColor)
    })
  }

  return {
    applyPreviewBackgroundColor,
    getPreviewBackgroundColor: () => previewBackgroundColor,
    initializePreviewBackgroundPicker,
    syncPreviewBackgroundPickerFromTheme,
  }
}
