import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const waitForInitialRender = async (page: Page) => {
  await page.goto('/src/index.html')
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#cdn-loading')).toHaveAttribute('hidden', '')
}

const setComponentEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.component-panel .cm-content').first()
  await editorContent.fill(source)
}

test('renders default playground preview', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await expect(page.locator('#status')).toHaveText('Rendered')

  const previewItems = page.locator('#preview-host li')
  await expect(previewItems).toHaveCount(3)
  await expect(previewItems.first()).toContainText('apple')
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

test('renders in react mode with css modules', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await page.locator('#render-mode').selectOption('react')
  await page.locator('#style-mode').selectOption('module')
  await expect(page.locator('#status')).toHaveText('Rendered')

  const previewItems = page.locator('#preview-host li')
  await expect(previewItems).toHaveCount(3)
  await expect(previewItems.first()).toContainText('apple')
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

test('shows error status when component source is cleared', async ({ page }) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  await page.getByLabel('Clear component source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(page.locator('#status')).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Expected a render() function or a component named App/View.',
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

  const previewItems = page.locator('#preview-host li')
  await expect(previewItems).toHaveCount(3)
  await expect(previewItems.first()).toContainText('apple')
})

test('renders with sass style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot (open)').uncheck()
  await page.locator('#style-mode').selectOption('sass')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#style-warning')).toContainText(
    'Sass is compiled in-browser via @knighted/css/browser.',
  )

  const previewItems = page.locator('#preview-host li')
  await expect(previewItems).toHaveCount(3)
  await expect(previewItems.first()).toContainText('apple')
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
