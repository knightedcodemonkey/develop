import { expect, test } from '@playwright/test'
import {
  ensurePanelToolsVisible,
  ensureDiagnosticsDrawerClosed,
  ensureDiagnosticsDrawerOpen,
  getActiveComponentEditorLineNumber,
  getActiveStylesEditorLineNumber,
  runComponentLint,
  runStylesLint,
  runTypecheck,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForInitialRender,
} from './helpers/app-test-helpers.js'

test('clear component action opens confirm dialog and can be canceled', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.getByRole('dialog')
  const jsxEditor = page.getByRole('textbox', {
    name: 'Component source editor fallback',
    includeHidden: true,
  })

  const beforeValue = await jsxEditor.inputValue()
  await page.getByLabel('Clear component source').click()

  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(
    'Clear Component source?',
  )

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(jsxEditor).toHaveValue(beforeValue)
})

test('clear styles action opens confirm dialog and clears on confirm', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.getByRole('dialog')
  const cssEditor = page.getByRole('textbox', {
    name: 'Styles source editor fallback',
    includeHidden: true,
  })

  await page.getByLabel('Clear styles source').click()

  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.getByRole('heading', { level: 3 })).toHaveText('Clear Styles source?')

  await dialog.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(cssEditor).toHaveValue('')
  await expect(page.getByText('Styles cleared', { exact: true })).toBeVisible()
})

test('clearing styles keeps diagnostics error state but resets status styling', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    ["const count: number = 'oops'", 'const App = () => <button>ready</button>'].join(
      '\n',
    ),
  )

  await page.getByRole('button', { name: 'Typecheck' }).click()

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(page.getByText(/Rendered \(Type errors: [1-9]\d*\)/)).toHaveClass(
    /status--error/,
  )
  await expect(diagnosticsToggle).toHaveText(/Diagnostics \([1-9]\d*\)/)
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)

  const dialog = page.getByRole('dialog')
  await ensureDiagnosticsDrawerClosed(page)
  await page.getByLabel('Clear styles source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(page.getByText('Styles cleared', { exact: true })).toHaveClass(
    /status--neutral/,
  )
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)
  await expect(diagnosticsToggle).toHaveText(/Diagnostics \([1-9]\d*\)/)
})

test('clear component diagnostics removes type errors and restores rendered status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    ["const count: number = 'oops'", 'const App = () => <button>ready</button>'].join(
      '\n',
    ),
  )

  await page.getByRole('button', { name: 'Typecheck' }).click()
  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)
  await expect(page.getByText(/Rendered \(Type errors: [1-9]\d*\)/)).toBeVisible()

  await ensureDiagnosticsDrawerOpen(page)
  await page.getByRole('button', { name: 'Reset component' }).click()

  await expect(page.getByText('No diagnostics yet.')).toHaveCount(2)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--neutral/)
  await expect(page.getByText('Rendered', { exact: true })).toHaveClass(/status--neutral/)
})

test('clear all diagnostics removes style compile diagnostics', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('Style mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.getByText('Style compilation failed.')).toBeVisible()

  await page.getByRole('button', { name: 'Reset all' }).click()
  await expect(page.getByText('No diagnostics yet.')).toHaveCount(2)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--neutral/)
})

test('clear styles diagnostics removes style compile diagnostics', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('Style mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.getByText('Style compilation failed.')).toBeVisible()

  await page.getByRole('button', { name: 'Reset styles' }).click()
  await expect(page.getByText('No diagnostics yet.')).toHaveCount(2)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--neutral/)
})

test('typecheck success reports ok diagnostics state in button and drawer', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await runTypecheck(page)

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(page.getByText('Rendered', { exact: true })).toBeVisible()
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--ok/)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.getByText('No TypeScript errors found.')).toBeVisible()
})

test('typecheck error reports diagnostics count in button and details in drawer', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ["const broken: number = 'oops'", 'const App = () => <button>hello</button>'].join(
      '\n',
    ),
  )

  await runTypecheck(page)

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(page.getByText(/Rendered \(Type errors: [1-9]\d*\)/)).toBeVisible()
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)
  await expect(diagnosticsToggle).toHaveText(/Diagnostics \([1-9]\d*\)/)

  await expect(
    page.getByRole('button', { name: 'Close diagnostics drawer' }),
  ).toBeVisible()
  await expect(page.getByText('TypeScript found')).toBeVisible()
  await expect(page.getByText(/TS\d+/)).toBeVisible()
})

test('component diagnostics rows navigate editor to reported line', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      "const brokenCount: number = 'oops'",
      'const App = () => <button>{brokenCount.toUpperCase()}</button>',
    ].join('\n'),
  )

  await runTypecheck(page)

  await expect(page.getByRole('button', { name: /^Diagnostics/ })).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await ensureDiagnosticsDrawerOpen(page)

  const targetDiagnostic = page.getByRole('button', { name: /^L2(:\d+)?\s/ }).first()
  await expect(targetDiagnostic).toBeVisible()

  await targetDiagnostic.click()
  await expect(targetDiagnostic).toHaveClass(/diagnostic-line-button--active/)
  await expect.poll(() => getActiveComponentEditorLineNumber(page)).toBe('2')
})

test('component diagnostics support arrow navigation and enter jump', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      "const broken: number = 'oops'",
      'const App = () => <button>{missingName}</button>',
    ].join('\n'),
  )

  await runTypecheck(page)
  await expect(page.getByRole('button', { name: /^Diagnostics/ })).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)

  const diagnosticButtons = page.getByRole('button', { name: /^L\d+(:\d+)?\s/ })
  const firstDiagnostic = diagnosticButtons.first()
  const secondDiagnostic = diagnosticButtons.nth(1)

  await expect(firstDiagnostic).toBeVisible()
  await expect(secondDiagnostic).toBeVisible()

  await firstDiagnostic.focus()
  await firstDiagnostic.press('ArrowDown')
  await expect(secondDiagnostic).toBeFocused()

  await secondDiagnostic.press('Enter')
  await expect(secondDiagnostic).toHaveClass(/diagnostic-line-button--active/)
  await expect.poll(() => getActiveComponentEditorLineNumber(page)).toBe('2')
})

test('component lint error reports diagnostics count and details', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const unusedValue = 1', 'const App = () => <button>lint me</button>'].join('\n'),
  )

  await runComponentLint(page)

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(page.getByText(/Rendered \(Lint issues: [1-9]\d*\)/)).toBeVisible()
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)
  await expect(diagnosticsToggle).toHaveText(/Diagnostics \([1-9]\d*\)/)

  await expect(
    page.getByRole('button', { name: 'Close diagnostics drawer' }),
  ).toBeVisible()
  await expect(page.getByText('Biome reported issues.')).toBeVisible()
})

test('styles diagnostics rows navigate editor to reported line', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')
  await setStylesEditorSource(
    page,
    ['.card {', '  color: red', '  color: blue;', '}'].join('\n'),
  )

  await runStylesLint(page)

  await expect(page.getByRole('button', { name: /^Diagnostics/ })).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await ensureDiagnosticsDrawerOpen(page)

  const targetDiagnostic = page.getByRole('button', { name: /^L3(:\d+)?\s/ }).first()
  await expect(targetDiagnostic).toBeVisible()

  await targetDiagnostic.click()
  await expect(targetDiagnostic).toHaveClass(/diagnostic-line-button--active/)
  await expect.poll(() => getActiveStylesEditorLineNumber(page)).toBe('3')
})

test('clear component diagnostics resets rendered lint-issue status pill', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      'const unusedValue = 1',
      'const App = () => <button type="button">lint me</button>',
    ].join('\n'),
  )

  await runComponentLint(page)

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(page.getByText(/Rendered \(Lint issues: [1-9]\d*\)/)).toHaveClass(
    /status--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)
  await page.getByRole('button', { name: 'Reset component' }).click()

  await expect(page.getByText('No diagnostics yet.')).toHaveCount(2)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--neutral/)
  await expect(page.getByText('Rendered', { exact: true })).toHaveClass(/status--neutral/)
})

test('component lint ignores unused App View and render bindings', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      'function App() { return <button type="button">App</button> }',
      'function View() { return <section>View</section> }',
      'function render() { return null }',
    ].join('\n'),
  )

  await runComponentLint(page)

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.getByText('No Biome issues found.')).toBeVisible()

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })
  await expect(page.getByText('Rendered', { exact: true })).toHaveClass(/status--neutral/)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--ok/)

  const diagnosticsText = await page.getByRole('complementary').innerText()
  expect(diagnosticsText).not.toContain('This variable App is unused')
  expect(diagnosticsText).not.toContain('This variable View is unused')
  expect(diagnosticsText).not.toContain('This variable render is unused')
  expect(diagnosticsText).not.toContain('This function App is unused')
  expect(diagnosticsText).not.toContain('This function View is unused')
  expect(diagnosticsText).not.toContain('This function render is unused')
})

test('component lint with unresolved issues enters pending diagnostics state while typing', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const unusedValue = 1', 'const App = () => <button>pending</button>'].join('\n'),
  )

  await runComponentLint(page)

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)

  await setComponentEditorSource(
    page,
    ['const unusedValue = 1', 'const App = () => <button>pending now</button>'].join(
      '\n',
    ),
  )

  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--pending/)
  await expect(diagnosticsToggle).toHaveAttribute('aria-busy', 'true')

  await expect(page.getByText(/Rendered \(Lint issues: [1-9]\d*\)/)).toBeVisible()
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)
  await expect(diagnosticsToggle).toHaveAttribute('aria-busy', 'false')
})

test('changing css dialect resets diagnostics after lint and typecheck runs', async ({
  page,
}) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'styles')

  await setComponentEditorSource(
    page,
    [
      "const broken: number = 'oops'",
      'const unusedValue = 1',
      'const App = () => <button>reset me</button>',
    ].join('\n'),
  )

  await runTypecheck(page)
  await runComponentLint(page)

  const diagnosticsToggle = page.getByRole('button', { name: /^Diagnostics/ })

  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--error/)
  await expect(diagnosticsToggle).toHaveText(/Diagnostics \([1-9]\d*\)/)

  await page.getByLabel('Style mode').selectOption('less')

  await expect(page.getByText('Rendered', { exact: true })).toHaveClass(/status--neutral/)
  await expect(diagnosticsToggle).toHaveClass(/diagnostics-toggle--neutral/)
  await expect(diagnosticsToggle).toHaveText('Diagnostics')

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.getByText('No diagnostics yet.')).toHaveCount(2)
})
