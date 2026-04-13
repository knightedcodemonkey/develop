const defaultLightPreviewBackgroundColor = '#ffffff'
const defaultDarkPreviewBackgroundColor = '#12141c'

const toHexChannel = value => value.toString(16).padStart(2, '0')

const normalizeColorToHex = colorValue => {
  if (typeof colorValue !== 'string' || colorValue.length === 0) {
    return ''
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
    return ''
  }

  const [red, green, blue] = channels.slice(0, 3).map(value => Number.parseInt(value, 10))
  if ([red, green, blue].some(value => Number.isNaN(value))) {
    return ''
  }

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}

export const createPreviewBackgroundController = ({
  previewBgColorInput,
  getPreviewHost,
  getDefaultPreviewBackgroundColor,
  onBackgroundColorChange,
}) => {
  let previewBackgroundColor = null
  let previewBackgroundCustomized = false

  const resolveDefaultPreviewBackgroundColor = () => {
    const themeDefaultPreviewBackgroundColor =
      document.documentElement.dataset.theme === 'light'
        ? defaultLightPreviewBackgroundColor
        : defaultDarkPreviewBackgroundColor

    if (typeof getDefaultPreviewBackgroundColor === 'function') {
      const configuredColor = getDefaultPreviewBackgroundColor()
      const normalizedConfiguredColor = normalizeColorToHex(configuredColor)
      if (normalizedConfiguredColor) {
        return normalizedConfiguredColor
      }
    }

    return themeDefaultPreviewBackgroundColor
  }

  const applyPreviewBackgroundColor = color => {
    const previewHost = getPreviewHost()
    if (!previewHost) {
      return
    }

    if (typeof color === 'string' && color.length > 0) {
      previewHost.style.backgroundColor = color
      previewHost.style.setProperty('--preview-iframe-background-color', color)

      if (typeof onBackgroundColorChange === 'function') {
        onBackgroundColorChange(color)
      }
      return
    }

    previewHost.style.removeProperty('background-color')
    previewHost.style.removeProperty('--preview-iframe-background-color')

    if (typeof onBackgroundColorChange === 'function') {
      onBackgroundColorChange('')
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
