import { expect, test } from '@playwright/test'
import {
  ensureDiagnosticsDrawerOpen,
  ensurePanelToolsVisible,
  expectPreviewHasRenderedContent,
  runTypecheck,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForInitialRender,
} from './helpers/app-test-helpers.js'

test('renders in react mode with css modules', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('module')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('transpiles TypeScript annotations in component source', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot').uncheck()
  await setComponentEditorSource(
    page,
    [
      'const Button = ({ label }: { label: string }): unknown => <button>{label}</button>',
      'const App = () => <Button label="typed" />',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toContainText('typed')
})

test('react mode typecheck loads types without malformed URL fetches', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const typeRequestUrls: string[] = []
  page.on('request', request => {
    const url = request.url()
    if (url.includes('@types/')) {
      typeRequestUrls.push(url)
    }
  })

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await page.getByRole('button', { name: 'Typecheck' }).click()

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No TypeScript errors found.',
  )

  const diagnosticsText = await page.locator('#diagnostics-component').innerText()
  expect(diagnosticsText).not.toContain("Cannot find type definition file for 'react'")
  expect(diagnosticsText).not.toContain(
    "Cannot find type definition file for 'react-dom'",
  )
  expect(diagnosticsText).not.toContain("Cannot find module 'react-dom/client'")
  expect(diagnosticsText).not.toContain('Cannot find module "react-dom/client"')

  expect(typeRequestUrls.some(url => url.includes('@types/react'))).toBeTruthy()

  const malformedTypeRequestPatterns = [
    '/@types/global.d.ts/package.json',
    '/user-context',
    '/https:/',
  ]

  for (const pattern of malformedTypeRequestPatterns) {
    expect(typeRequestUrls.some(url => url.includes(pattern))).toBeFalsy()
  }
})

test('dom mode typecheck does not hydrate react type graph', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const typeRequestUrls: string[] = []
  page.on('request', request => {
    const url = request.url()
    if (url.includes('@types/')) {
      typeRequestUrls.push(url)
    }
  })

  await runTypecheck(page)

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  expect(typeRequestUrls.some(url => url.includes('@types/react'))).toBeFalsy()
  expect(typeRequestUrls.some(url => url.includes('@types/react-dom'))).toBeFalsy()
})

test('react mode executes default React import without TDZ runtime failure', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await setComponentEditorSource(
    page,
    [
      "import React from 'react'",
      'const App = () => <button>react default import works</button>',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toContainText('react default import works')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('clearing component source reports clear action without error status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.getByRole('dialog', { name: 'Clear Component source?' })
  await page.getByLabel('Clear component source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toHaveCount(0)
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'Component cleared',
  )
  await expect(page.getByRole('status', { name: 'App status' })).toHaveClass(
    /status--neutral/,
  )
})

test('jsx syntax errors affect status but not diagnostics toggle severity', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const App = () => <button', 'const value = 1'].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveClass(
    /status--error/,
  )
  await expect(page.locator('#preview-host pre')).toContainText('[jsx]')
  const diagnosticsToggle = page.getByRole('button', { name: 'Diagnostics' })
  await expect(diagnosticsToggle).toHaveText('Diagnostics')
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--neutral/)
})

test('requires render button when auto render is disabled', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')

  const autoRenderToggle = page.getByLabel('Auto render')
  const renderButton = page.getByRole('button', { name: 'Render' })
  const styleMode = page.getByRole('combobox', { name: 'Style mode' })

  await autoRenderToggle.uncheck()
  await expect(renderButton).toBeVisible()

  await styleMode.selectOption('module')

  await renderButton.click()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('clears preview when auto render is toggled', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const autoRenderToggle = page.getByLabel('Auto render')

  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toHaveCount(1)

  await autoRenderToggle.uncheck()

  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toHaveCount(0)
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('shows App-only error when auto render is disabled and App is missing', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const autoRenderToggle = page.getByLabel('Auto render')
  const renderButton = page.getByRole('button', { name: 'Render' })

  await autoRenderToggle.uncheck()
  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">no app wrapper</button>',
  )

  await renderButton.click()

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Expected a function or const named App.',
  )
})

test('auto render implicitly wraps source with App in dom and react modes', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await page.getByLabel('ShadowRoot').uncheck()

  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">implicit app dom</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toContainText('implicit app dom')

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">implicit app react</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toContainText('implicit app react')
})

test('auto render implicit App includes multiple component declarations', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await page.getByLabel('ShadowRoot').uncheck()

  await setComponentEditorSource(
    page,
    [
      'const OtherButton = () => <button type="button">bar</button>',
      'const Button = () => <button type="button">foo</button>',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toHaveCount(2)
  await expect(
    page.getByRole('region', { name: 'Preview output' }).getByRole('button'),
  ).toContainText(['bar', 'foo'])
})

test('persists layout and theme across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await page.getByLabel('Use light theme').click()
  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('renders with less style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('less')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('renders with sass style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('sass')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('style compilation errors populate styles diagnostics scope', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.getByRole('button', { name: 'Diagnostics' })).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-styles')).toContainText(
    'Style compilation failed.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('Undefined variable')
})
