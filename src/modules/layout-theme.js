const appGridLayouts = ['default', 'preview-right', 'preview-left']

export const createLayoutThemeController = ({
  appGrid,
  appGridLayoutButtons,
  appThemeButtons,
  syncPreviewBackgroundPickerFromTheme,
  appGridLayoutStorageKey = 'knighted-develop:app-grid-layout',
  appThemeStorageKey = 'knighted-develop:theme',
}) => {
  const applyAppGridLayout = (layout, { persist = true } = {}) => {
    if (!appGrid || !appGridLayouts.includes(layout)) {
      return
    }

    appGrid.classList.toggle('app-grid--preview-right', layout === 'preview-right')
    appGrid.classList.toggle('app-grid--preview-left', layout === 'preview-left')

    for (const button of appGridLayoutButtons) {
      const isActive = button.dataset.appGridLayout === layout
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    if (persist) {
      try {
        localStorage.setItem(appGridLayoutStorageKey, layout)
      } catch {
        /* Ignore storage write errors in restricted browsing modes. */
      }
    }
  }

  const getInitialAppGridLayout = () => {
    try {
      const value = localStorage.getItem(appGridLayoutStorageKey)
      if (appGridLayouts.includes(value)) {
        return value
      }
    } catch {
      /* Ignore storage read errors in restricted browsing modes. */
    }

    return 'default'
  }

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
    applyAppGridLayout,
    applyTheme,
    getInitialAppGridLayout,
    getInitialTheme,
  }
}
