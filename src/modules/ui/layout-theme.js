export const createLayoutThemeController = ({
  appThemeButtons,
  syncPreviewBackgroundPickerFromTheme,
  appThemeStorageKey = 'knighted-develop:theme',
}) => {
  const applyTheme = (theme, { persist = true } = {}) => {
    if (!['dark', 'light'].includes(theme)) {
      return
    }

    document.documentElement.dataset.theme = theme
    syncPreviewBackgroundPickerFromTheme()

    for (const button of appThemeButtons) {
      const isActive = button.dataset.appTheme === theme
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    if (persist) {
      try {
        localStorage.setItem(appThemeStorageKey, theme)
      } catch {
        /* Ignore storage write errors in restricted browsing modes. */
      }
    }
  }

  const getInitialTheme = () => {
    try {
      const value = localStorage.getItem(appThemeStorageKey)
      if (value === 'dark' || value === 'light') {
        return value
      }
    } catch {
      /* Ignore storage read errors in restricted browsing modes. */
    }

    return 'dark'
  }

  return {
    applyTheme,
    getInitialTheme,
  }
}
