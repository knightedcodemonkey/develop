import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const webServerMode = process.env.PLAYWRIGHT_WEB_SERVER_MODE ?? 'dev'
const appEntryPath = webServerMode === 'preview' ? '/index.html' : '/src/index.html'

const waitForInitialRender = async (page: Page) => {
  await page.goto(appEntryPath)
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#cdn-loading')).toHaveAttribute('hidden', '')
}

const expectPreviewHasRenderedContent = async (page: Page) => {
  const previewHost = page.locator('#preview-host')
  await expect(previewHost.locator('pre')).toHaveCount(0)
  await expect
    .poll(() => previewHost.evaluate(node => node.childElementCount))
    .toBeGreaterThan(0)
}

const setComponentEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.component-panel .cm-content').first()
  await editorContent.fill(source)
}

const setStylesEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.styles-panel .cm-content').first()
  await editorContent.fill(source)
}

const getCollapseButton = (page: Page, panelName: 'component' | 'styles' | 'preview') =>
  page.locator(`#collapse-${panelName}`)

const expectCollapseButtonState = async (
  page: Page,
  panelName: 'component' | 'styles' | 'preview',
  {
    axis,
    direction,
    collapsed,
    disabled,
  }: {
    axis: 'vertical' | 'horizontal'
    direction: 'left' | 'right' | 'none'
    collapsed: boolean
    disabled?: boolean
  },
) => {
  const button = getCollapseButton(page, panelName)

  await expect(button).toHaveAttribute('data-collapse-axis', axis)
  await expect(button).toHaveAttribute('data-collapse-direction', direction)
  await expect(button).toHaveAttribute('data-collapsed', collapsed ? 'true' : 'false')

  if (disabled !== undefined) {
    if (disabled) {
      await expect(button).toBeDisabled()
    } else {
      await expect(button).toBeEnabled()
    }
  }
}

test('renders default playground preview', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('supports layout and theme toggles', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)

  await page.getByLabel('Use light theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const colorInput = page.locator('#preview-bg-color')
  await colorInput.fill('#2456a8')
  await expect(page.locator('#preview-host')).toHaveCSS(
    'background-color',
    'rgb(36, 86, 168)',
  )
})

test('side layout keeps preview panel height within editor stack height', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)

  const metrics = await page.evaluate(() => {
    const stack = document.querySelector('.panels-stack--editors')
    const previewPanel = document.getElementById('preview-panel')
    const stackHeight = stack?.getBoundingClientRect().height ?? 0
    const previewHeight = previewPanel?.getBoundingClientRect().height ?? 0
    const previewOverflowY = previewPanel ? getComputedStyle(previewPanel).overflowY : ''
    return { stackHeight, previewHeight, previewOverflowY }
  })

  expect(metrics.stackHeight).toBeGreaterThan(0)
  expect(metrics.previewHeight).toBeGreaterThan(0)
  expect(metrics.previewHeight).toBeLessThanOrEqual(metrics.stackHeight + 2)
  expect(metrics.previewOverflowY).toBe('hidden')
})

test('side layout config keeps preview scrolling inside preview host', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()

  const scrollConfig = await page.evaluate(() => {
    const previewPanel = document.getElementById('preview-panel')
    const previewHost = document.getElementById('preview-host')
    if (!previewPanel || !previewHost) {
      return null
    }

    const panelStyles = getComputedStyle(previewPanel)
    const styles = getComputedStyle(previewHost)
    return {
      panelOverflowY: panelStyles.overflowY,
      panelOverflowX: panelStyles.overflowX,
      overflowY: styles.overflowY,
      minHeight: styles.minHeight,
    }
  })

  expect(scrollConfig).not.toBeNull()
  expect(scrollConfig?.panelOverflowY).toBe('hidden')
  expect(scrollConfig?.panelOverflowX).toBe('hidden')
  expect(['auto', 'scroll']).toContain(scrollConfig?.overflowY)
  expect(scrollConfig?.minHeight).toBe('0px')
})

test('expanded component and styles can shrink consistently in side layouts', async ({
  page,
}) => {
  await waitForInitialRender(page)

  for (const layoutLabel of ['Use side preview layout', 'Use left preview layout']) {
    await page.getByLabel(layoutLabel).click()

    const minHeights = await page.evaluate(() => {
      const component = document.getElementById('component-panel')
      const styles = document.getElementById('styles-panel')
      return {
        component: component
          ? Number.parseFloat(getComputedStyle(component).minHeight)
          : 0,
        styles: styles ? Number.parseFloat(getComputedStyle(styles).minHeight) : 0,
      }
    })

    expect(minHeights.component).toBeGreaterThanOrEqual(0)
    expect(minHeights.styles).toBeGreaterThanOrEqual(0)
    expect(Math.abs(minHeights.component - minHeights.styles)).toBeLessThanOrEqual(1)
  }
})

test('panel collapse axis and direction adapt to active layout', async ({ page }) => {
  await waitForInitialRender(page)
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid/)

  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: false,
  })
  await expectCollapseButtonState(page, 'styles', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
  })
  await expectCollapseButtonState(page, 'preview', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
  })

  await page.getByLabel('Use side preview layout').click()
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
  })
  await expectCollapseButtonState(page, 'component', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
  })

  await page.getByLabel('Use left preview layout').click()
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: false,
  })
})

test('prevents collapsing all three panels at once', async ({ page }) => {
  await waitForInitialRender(page)

  await getCollapseButton(page, 'component').click()
  await getCollapseButton(page, 'styles').click()

  await expect(page.locator('#component-panel')).toHaveClass(
    /panel--collapsed-horizontal/,
  )
  await expect(page.locator('#styles-panel')).toHaveClass(/panel--collapsed-horizontal/)

  await expectCollapseButtonState(page, 'preview', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
    disabled: true,
  })
  await expect(getCollapseButton(page, 'preview')).toHaveAttribute(
    'title',
    'At least one panel must remain expanded.',
  )

  await getCollapseButton(page, 'component').click()
  await expectCollapseButtonState(page, 'preview', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
    disabled: false,
  })
})

test('does not persist panel collapse state across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await getCollapseButton(page, 'component').click()
  await expect(page.locator('#component-panel')).toHaveClass(
    /panel--collapsed-horizontal/,
  )
  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: true,
  })

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.locator('#component-panel')).not.toHaveClass(
    /panel--collapsed-horizontal|panel--collapsed-vertical/,
  )
  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: false,
  })
})

test('renders in react mode with css modules', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await page.locator('#render-mode').selectOption('react')
  await page.locator('#style-mode').selectOption('module')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('transpiles TypeScript annotations in component source', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await setComponentEditorSource(
    page,
    [
      'const Button = ({ label }: { label: string }): unknown => <button>{label}</button>',
      'const App = () => <Button label="typed" />',
    ].join('\n'),
  )

  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#preview-host button')).toContainText('typed')
})

test('clearing component source reports clear action without error status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  await page.getByLabel('Clear component source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(page.locator('#status')).toHaveText('Component cleared')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('jsx syntax errors affect status but not diagnostics toggle severity', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const App = () => <button', 'const value = 1'].join('\n'),
  )

  await expect(page.locator('#status')).toHaveText('Error')
  await expect(page.locator('#status')).toHaveClass(/status--error/)
  await expect(page.locator('#preview-host pre')).toContainText('[jsx]')
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
})

test('requires render button when auto render is disabled', async ({ page }) => {
  await waitForInitialRender(page)

  const autoRenderToggle = page.getByLabel('Auto render')
  const renderButton = page.getByRole('button', { name: 'Render' })
  const styleMode = page.locator('#style-mode')
  const styleWarning = page.locator('#style-warning')

  await expect(styleWarning).toHaveText('')
  await autoRenderToggle.uncheck()
  await expect(renderButton).toBeVisible()

  await styleMode.selectOption('module')
  await expect(styleWarning).toHaveText('')

  await renderButton.click()
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(styleWarning).toContainText('CSS Modules are compiled in-browser')
})

test('persists layout and theme across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await page.getByLabel('Use light theme').click()
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('renders with less style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await page.locator('#style-mode').selectOption('less')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#style-warning')).toContainText(
    'Less is compiled in-browser via @knighted/css/browser.',
  )
  await expectPreviewHasRenderedContent(page)
})

test('renders with sass style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await page.locator('#style-mode').selectOption('sass')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#style-warning')).toContainText(
    'Sass is compiled in-browser via @knighted/css/browser.',
  )
  await expectPreviewHasRenderedContent(page)
})

test('style compilation errors populate styles diagnostics scope', async ({ page }) => {
  await waitForInitialRender(page)

  await page.locator('#style-mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  await expect(page.locator('#status')).toHaveText('Error')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await page.locator('#diagnostics-toggle').click()
  await expect(page.locator('#diagnostics-styles')).toContainText(
    'Style compilation failed.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('Undefined variable')
})

test('clear component action opens confirm dialog and can be canceled', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  const jsxEditor = page.locator('#jsx-editor')

  const beforeValue = await jsxEditor.inputValue()
  await page.getByLabel('Clear component source').click()

  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.locator('#clear-confirm-title')).toHaveText('Clear Component source?')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
  await expect(jsxEditor).toHaveValue(beforeValue)
})

test('clear styles action opens confirm dialog and clears on confirm', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  const cssEditor = page.locator('#css-editor')

  await page.getByLabel('Clear styles source').click()

  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.locator('#clear-confirm-title')).toHaveText('Clear Styles source?')

  await dialog.getByRole('button', { name: 'Clear' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
  await expect(cssEditor).toHaveValue('')
  await expect(page.locator('#status')).toHaveText('Styles cleared')
})

test('clearing styles keeps diagnostics error state but resets status styling', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ["const count: number = 'oops'", 'const App = () => <button>ready</button>'].join(
      '\n',
    ),
  )

  await page.getByRole('button', { name: 'Typecheck' }).click()

  await expect(page.locator('#status')).toHaveText(/Rendered \(Type errors: [1-9]\d*\)/)
  await expect(page.locator('#status')).toHaveClass(/status--error/)
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  const dialog = page.locator('#clear-confirm-dialog')
  await page.getByLabel('Clear styles source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(page.locator('#status')).toHaveText('Styles cleared')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)
})

test('clear component diagnostics removes type errors and restores rendered status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ["const count: number = 'oops'", 'const App = () => <button>ready</button>'].join(
      '\n',
    ),
  )

  await page.getByRole('button', { name: 'Typecheck' }).click()
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#status')).toHaveText(/Rendered \(Type errors: [1-9]\d*\)/)

  await page.locator('#diagnostics-toggle').click()
  await page.locator('#diagnostics-clear-component').click()

  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
})

test('clear all diagnostics removes style compile diagnostics', async ({ page }) => {
  await waitForInitialRender(page)

  await page.locator('#style-mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await page.locator('#diagnostics-toggle').click()
  await expect(page.locator('#diagnostics-styles')).toContainText(
    'Style compilation failed.',
  )

  await page.locator('#diagnostics-clear-all').click()
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('No diagnostics yet.')
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
})
