const toHexChannel = value => value.toString(16).padStart(2, '0')

const normalizeColorToHex = colorValue => {
  if (typeof colorValue !== 'string' || colorValue.length === 0) {
    return '#12141c'
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
    return '#12141c'
  }

  const [red, green, blue] = channels.slice(0, 3).map(value => Number.parseInt(value, 10))
  if ([red, green, blue].some(value => Number.isNaN(value))) {
    return '#12141c'
  }

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}

export const createPreviewBackgroundController = ({
  previewBgColorInput,
  getPreviewHost,
}) => {
  let previewBackgroundColor = null
  let previewBackgroundCustomized = false

  const applyPreviewBackgroundColor = color => {
    const previewHost = getPreviewHost()
    if (!previewHost) {
      return
    }

    if (typeof color === 'string' && color.length > 0) {
      previewHost.style.backgroundColor = color
      return
    }

    previewHost.style.removeProperty('background-color')
  }

  const syncPreviewBackgroundPickerFromTheme = () => {
    const previewHost = getPreviewHost()
    if (!previewBgColorInput || !previewHost || previewBackgroundCustomized) {
      return
    }

    previewBackgroundColor = null
    applyPreviewBackgroundColor(null)
    previewBgColorInput.value = normalizeColorToHex(
      getComputedStyle(previewHost).backgroundColor,
    )
  }

  const initializePreviewBackgroundPicker = () => {
    const previewHost = getPreviewHost()
    if (!previewBgColorInput || !previewHost) {
      return
    }

    const initialColor = normalizeColorToHex(
      getComputedStyle(previewHost).backgroundColor,
    )
    previewBackgroundColor = null
    previewBackgroundCustomized = false
    previewBgColorInput.value = initialColor
    applyPreviewBackgroundColor(null)

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
