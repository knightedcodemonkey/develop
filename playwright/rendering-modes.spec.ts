import { expect, test } from '@playwright/test'
import {
  addWorkspaceTab,
  ensureDiagnosticsDrawerOpen,
  ensurePanelToolsVisible,
  expectPreviewHasRenderedContent,
  getPreviewFrame,
  openWorkspaceTab,
  resetWorkbenchStorage,
  runTypecheck,
  setComponentEditorSource,
  setWorkspaceTabSource,
  waitForInitialRender,
} from './helpers/app-test-helpers.js'

const renameWorkspaceTab = async (
  page: import('@playwright/test').Page,
  {
    from,
    to,
  }: {
    from: string
    to: string
  },
) => {
  await page.getByRole('button', { name: `Rename tab ${from}` }).click()
  const renameInput = page.getByLabel(`Rename ${from}`)
  await renameInput.fill(to)
  await renameInput.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await resetWorkbenchStorage(page)
})

test('renders in react mode with css modules', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')

  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await page.getByRole('button', { name: 'Open tab app.css' }).click()
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('module')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('preview styles require explicit import from entry graph', async ({ page }) => {
  await waitForInitialRender(page)

  await setWorkspaceTabSource(page, {
    fileName: 'app.css',
    kind: 'styles',
    source: ['.counter-button { color: rgb(1, 2, 3); }'].join('\n'),
  })

  await expect
    .poll(async () => {
      const styleContent = await getPreviewFrame(page)
        .locator('style')
        .first()
        .textContent()
      return styleContent ?? ''
    })
    .toContain('rgb(1, 2, 3)')

  await setComponentEditorSource(
    page,
    [
      'const App = () => <button class="counter-button">No style import</button>',
      '',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect
    .poll(async () => {
      const styleContent = await getPreviewFrame(page)
        .locator('style')
        .first()
        .textContent()
      return styleContent ?? ''
    })
    .not.toContain('rgb(1, 2, 3)')
})

test('nested module imports can bring styles into preview graph', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page, { kind: 'component' })
  await addWorkspaceTab(page, { kind: 'styles' })

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    kind: 'component',
    source: [
      "import '../styles/module.css'",
      '',
      'export const ModuleButton = () => <button class="module-button">Nested style</button>',
    ].join('\n'),
  })

  await setWorkspaceTabSource(page, {
    fileName: 'module.css',
    kind: 'styles',
    source: ['.module-button { color: rgb(9, 8, 7); }'].join('\n'),
  })

  await setComponentEditorSource(
    page,
    [
      "import { ModuleButton } from './module'",
      '',
      'const App = () => <ModuleButton />',
      '',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText('Nested style')
  await expect
    .poll(async () => {
      const styleContent = await getPreviewFrame(page)
        .locator('style')
        .first()
        .textContent()
      return styleContent ?? ''
    })
    .toContain('rgb(9, 8, 7)')
})

test('transpiles TypeScript annotations in component source', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      'const Button = ({ label }: { label: string }): unknown => <button>{label}</button>',
      'const App = () => <Button label="typed" />',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText('typed')
})

test('dom mode supports type-only imports without runtime export syntax errors', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('dom')

  await setComponentEditorSource(
    page,
    [
      "import type { JsxChildren } from '@knighted/jsx'",
      '',
      'type DrawerProps = {',
      '  children?: JsxChildren',
      '}',
      '',
      'const Drawer = ({ children }: DrawerProps) => {',
      '  return <div className="drawer">{children}</div>',
      '}',
      '',
      'const App = () => {',
      '  return <Drawer><button type="button">typed children import</button></Drawer>',
      '}',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'typed children import',
  )
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
  await runTypecheck(page)

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-component')).not.toContainText('Type checking…')

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

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await setComponentEditorSource(
    page,
    [
      "import React from 'react'",
      'const App = () => <button>react default import works</button>',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'react default import works',
  )
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('react mode mounts into internal non-div host to avoid div selector bleed', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')
  await openWorkspaceTab(page, 'App.tsx')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')

  await setWorkspaceTabSource(page, {
    fileName: 'app.css',
    kind: 'styles',
    source: ['div { border: 1px dotted green; }'].join('\n'),
  })

  await setComponentEditorSource(
    page,
    [
      "import React from 'react'",
      'export const App = () => (',
      '  <>',
      '    <div>inner</div>',
      '    <button type="button">btn</button>',
      '  </>',
      ')',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  await expect(getPreviewFrame(page).locator('body > knighted-preview-root')).toHaveCount(
    1,
  )
})

test('clearing component source reports clear action without error status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.getByRole('dialog', { name: 'Clear Component source?' })
  await page.getByLabel('Clear component source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(getPreviewFrame(page).getByRole('button')).toHaveCount(0)
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

test('high-signal runtime errors surface as runtime diagnostics without uncaught page errors', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const pageErrors: string[] = []
  page.on('pageerror', error => {
    pageErrors.push(error.message)
  })

  await setComponentEditorSource(
    page,
    ["const App = () => { throw new TypeError('intentional runtime failure') }"].join(
      '\n',
    ),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText('[runtime]')
  await expect(page.locator('#preview-host pre')).toContainText(
    'intentional runtime failure',
  )
  await expect(page.locator('#preview-host pre')).toContainText(
    'Entry: @knighted/workspace/',
  )
  await expect(page.locator('#preview-host pre')).toContainText('Source:')

  expect(pageErrors).toEqual([])
})

test('editing-transient missing reference runtime errors are suppressed', async ({
  page,
}) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')

  await setComponentEditorSource(
    page,
    [
      "import { useState, useCallback } from 'react'",
      '',
      'const App = () => {',
      '  const [count, setCount] = useState(0)',
      '  const handleOnClick = useCallback(() => {',
      '    setCount(count + 1)',
      '  }, [count])',
      '  co',
      '  return (',
      '    <button type="button" onClick={handleOnClick}>{count}</button>',
      '  )',
      '}',
    ].join('\n'),
  )

  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'App status' })).not.toHaveText('Error')
})

test('preview iframe sandbox isolates parent origin access', async ({ page }) => {
  await waitForInitialRender(page)

  const iframe = page.locator('#preview-host iframe')
  const sandbox = await iframe.getAttribute('sandbox')

  expect(typeof sandbox).toBe('string')
  expect(sandbox?.includes('allow-same-origin')).toBeFalsy()

  await setComponentEditorSource(
    page,
    [
      'const canReadParentStorage = (() => {',
      '  try {',
      '    return Boolean(window.parent.localStorage)',
      '  } catch {',
      '    return false',
      '  }',
      '})()',
      '',
      'export const App = () => (',
      "  <button type='button'>",
      "    {canReadParentStorage ? 'parent-readable' : 'parent-blocked'}",
      '  </button>',
      ')',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText('parent-blocked')
})

test('post-render runtime exceptions from iframe are reported in preview panel', async ({
  page,
}) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')

  await setComponentEditorSource(
    page,
    [
      "import React from 'react'",
      'export const App = () => (',
      '  <button type="button" onClick={() => {',
      "    throw new Error('clicked boom')",
      '  }}>',
      '    click boom',
      '  </button>',
      ')',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await getPreviewFrame(page).getByRole('button', { name: 'click boom' }).click()

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText('[runtime]')
  await expect(page.locator('#preview-host pre')).toContainText('clicked boom')
})

test('post-render runtime errors fully recover after source fix', async ({ page }) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')

  await setComponentEditorSource(
    page,
    [
      "import React, { useState } from 'react'",
      'export const App = () => {',
      '  const [count, setCount] = useState(0)',
      '  return (',
      '    <button type="button" onClick={() => {',
      "      throw new Error('clicked boom')",
      '    }}>',
      '      click boom',
      '    </button>',
      '  )',
      '}',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await getPreviewFrame(page).getByRole('button', { name: 'click boom' }).click()

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText('clicked boom')

  await setComponentEditorSource(
    page,
    [
      "import React, { useState } from 'react'",
      'export const App = () => {',
      '  const [count, setCount] = useState(0)',
      '  return (',
      '    <button type="button" onClick={() => setCount(prev => prev + 1)}>',
      '      safe click {count}',
      '    </button>',
      '  )',
      '}',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await getPreviewFrame(page).getByRole('button', { name: 'safe click 0' }).click()
  await expect(
    getPreviewFrame(page).getByRole('button', { name: 'safe click 1' }),
  ).toBeVisible()
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('requires render button when auto render is disabled', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')

  const autoRenderToggle = page.getByLabel('Auto render')
  const renderButton = page.getByRole('button', { name: 'Render' })

  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
  await autoRenderToggle.uncheck()
  await expect(renderButton).toBeVisible()

  await page.getByRole('button', { name: 'Open tab app.css' }).click()
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('module')
  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()

  await renderButton.click()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('clears preview when auto render is toggled', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const autoRenderToggle = page.getByLabel('Auto render')
  const previewHost = page.locator('#preview-host')

  await expect
    .poll(() => previewHost.evaluate(node => node.childElementCount))
    .toBeGreaterThan(0)

  await autoRenderToggle.uncheck()

  await expect.poll(() => previewHost.evaluate(node => node.childElementCount)).toBe(0)
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

  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">implicit app dom</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'implicit app dom',
  )

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">implicit app react</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'implicit app react',
  )
})

test('auto render implicit App includes multiple component declarations', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    [
      'const OtherButton = () => <button type="button">bar</button>',
      'const Button = () => <button type="button">foo</button>',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toHaveCount(2)
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(['bar', 'foo'])
})

test('auto render does not treat lowercase helpers as implicit components', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    [
      'const helper = () => <button type="button">helper</button>',
      'function render() { return <div /> }',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Expected a function or const named App.',
  )
})

test('auto render wraps standalone JSX with trailing semicolon and comment', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    '(<button type="button">implicit app from jsx expression</button>) as any; // trailing',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'implicit app from jsx expression',
  )
})

test('auto render requires explicit App for declarations plus top-level JSX expression', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    [
      "const label = 'kept declarations'",
      'const Button = () => <button type="button">{label}</button>',
      '(<Button />) as any',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Top-level JSX with declarations or imports requires an explicit App component.',
  )
})

test('persists theme across reload with fixed layout', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use light theme').click()
  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('persists render mode across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  await page.reload()
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')

  await expect(page.getByRole('combobox', { name: 'Render mode' })).toHaveValue('react')
})

test('persists style mode across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('sass')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  await page.reload()
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'styles')

  await expect(page.getByRole('combobox', { name: 'Style mode' })).toHaveValue('sass')
})

test('renders with less style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('less')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('renders with sass style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('sass')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('workspace tabs isolate duplicate exported identifiers in iframe module scope', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)
  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: 'export const Button = () => <button type="button">workspace button</button>',
  })

  await openWorkspaceTab(page, 'App.tsx')
  await setComponentEditorSource(
    page,
    [
      "import { Button as WorkspaceButton } from './module'",
      'const Button = () => <button type="button">local button</button>',
      'export const App = () => (',
      '  <>',
      '    <Button />',
      '    <WorkspaceButton />',
      '  </>',
      ')',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toHaveCount(2)
  await expect(getPreviewFrame(page).getByRole('button')).toContainText([
    'local button',
    'workspace button',
  ])
})

test('workspace tabs resolve extensionless relative imports through virtual module map', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await setWorkspaceTabSource(page, {
    fileName: 'module-2.tsx',
    source: "export const label = 'extensionless import ok'",
  })

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: [
      "import { label } from './module-2'",
      'export const Button = () => <button type="button">{label}</button>',
    ].join('\n'),
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import { Button } from './module'",
      'export const App = () => <Button />',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'extensionless import ok',
  )
})

test('workspace tabs resolve .js specifiers to tsx workspace modules when exact match is missing', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: "export const label = 'js specifier to tsx fallback'",
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import { label } from './module.js'",
      'export const App = () => <button type="button">{label}</button>',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'js specifier to tsx fallback',
  )
})

test('workspace graph errors are deterministic for ambiguous extension compatibility matches', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await renameWorkspaceTab(page, {
    from: 'module-2.tsx',
    to: 'module.ts',
  })

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: "export const label = 'from tsx'",
  })

  await setWorkspaceTabSource(page, {
    fileName: 'module.ts',
    source: "export const label = 'from ts'",
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import { label } from './module.js'",
      'export const App = () => <button type="button">{label}</button>',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Preview entry references ambiguous workspace module: ./module.js',
  )
  await expect(page.locator('#preview-host pre')).toContainText(
    'src/components/module.ts',
  )
  await expect(page.locator('#preview-host pre')).toContainText(
    'src/components/module.tsx',
  )
})

test('workspace graph errors for missing modules remain deterministic', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await setComponentEditorSource(
    page,
    [
      "import { MissingThing } from './does-not-exist'",
      'export const App = () => <button>{String(MissingThing)}</button>',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Preview entry references missing workspace module: ./does-not-exist',
  )
})

test('renaming an imported module tab re-renders and surfaces missing import errors', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)
  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: [
      'export const ItemWrap = ({ children }: { children: string }) => {',
      '  return <span>{children}</span>',
      '}',
    ].join('\n'),
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import { ItemWrap } from './module'",
      'export const App = () => <ItemWrap>hello</ItemWrap>',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  await page.getByRole('button', { name: 'Rename tab module.tsx' }).click()
  const renameInput = page.getByLabel('Rename module.tsx')
  await renameInput.fill('module-renamed.tsx')
  await renameInput.press('Enter')

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Preview entry references missing workspace module: ./module',
  )
})

test('renaming default styles tab updates graph resolution and surfaces stale import', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByRole('button', { name: 'Rename tab app.css' }).click()
  const renameInput = page.getByLabel('Rename app.css')
  await renameInput.fill('app.less')
  await renameInput.press('Enter')

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Preview entry references missing workspace module: ../styles/app.css',
  )

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import '../styles/app.less'",
      '',
      'type CounterButtonProps = {',
      '  label: string',
      '  onClick: (event: MouseEvent) => void',
      '}',
      '',
      'const CounterButton = ({ label, onClick }: CounterButtonProps) => (',
      '  <button class="counter-button" type="button" onClick={onClick}>',
      '    {label}',
      '  </button>',
      ')',
      '',
      'const App = () => {',
      '  let count = 0',
      '  const handleClick = (event: MouseEvent) => {',
      '    count += 1',
      '    const button = event.currentTarget as HTMLButtonElement',
      '    button.textContent = `Clicks: ${count}`',
      "    button.dataset.active = count % 2 === 0 ? 'false' : 'true'",
      "    button.classList.toggle('is-even', count % 2 === 0)",
      '  }',
      '',
      "  return <CounterButton label='Clicks: 0' onClick={handleClick} />",
      '}',
      '',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('workspace graph errors for circular imports remain deterministic', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)
  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: ["import { App } from './App'", 'export const ping = () => App'].join('\n'),
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import { ping } from './module'",
      'export const App = () => <button>{String(Boolean(ping))}</button>',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Preview entry contains circular workspace import:',
  )
  await expect(page.locator('#preview-host pre')).toContainText('Import chain: ./module')
})

test('children runtime errors recover after module fix and mode switches', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await addWorkspaceTab(page)

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: [
      'export const ItemWrap = ({ children: string }) => {',
      '  return <span className="item-wrap">{children}</span>',
      '}',
    ].join('\n'),
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: [
      "import { ItemWrap } from './module.tsx'",
      'export const App = () => (',
      '  <div>',
      '    <ItemWrap>hello children</ItemWrap>',
      '  </div>',
      ')',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    /\[runtime\]\s+(children is not defined|Can't find variable: children)/,
  )

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: [
      'export const ItemWrap = ({ children }: { children: string }) => {',
      '  return <span className="item-wrap">{children}</span>',
      '}',
    ].join('\n'),
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(getPreviewFrame(page).getByText('hello children')).toBeVisible()

  await openWorkspaceTab(page, 'App.tsx')
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(getPreviewFrame(page).getByText('hello children')).toBeVisible()

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('dom')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(getPreviewFrame(page).getByText('hello children')).toBeVisible()
})

test('auto-render skips unrelated component tab edits outside entry dependency graph', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await addWorkspaceTab(page)
  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: "export const value = 'first'",
  })

  await setWorkspaceTabSource(page, {
    fileName: 'App.tsx',
    source: "export const App = () => <button type='button'>entry only</button>",
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  const pendingWatcher = page.evaluate(() => {
    const status = document.getElementById('status')

    return new Promise(resolve => {
      if (!status) {
        resolve(false)
        return
      }

      let sawPending = false
      const observer = new MutationObserver(() => {
        if (status.textContent?.trim() === 'Rendering…') {
          sawPending = true
        }
      })

      observer.observe(status, {
        childList: true,
        subtree: true,
        characterData: true,
      })

      setTimeout(() => {
        observer.disconnect()
        resolve(sawPending)
      }, 700)
    })
  })

  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: "export const value = 'second'",
  })

  await expect(pendingWatcher).resolves.toBe(false)
})
