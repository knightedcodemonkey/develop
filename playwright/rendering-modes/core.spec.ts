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
} from '../helpers/app-test-helpers.js'

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

const renameWorkspaceTabFromCandidates = async (
  page: import('@playwright/test').Page,
  {
    fromCandidates,
    to,
  }: {
    fromCandidates: string[]
    to: string
  },
) => {
  for (const from of fromCandidates) {
    const button = page.getByRole('button', { name: `Rename tab ${from}` })
    if ((await button.count()) === 0) {
      continue
    }

    await button.click()
    const renameInput = page.getByLabel(`Rename ${from}`)
    await renameInput.fill(to)
    await renameInput.press('Enter')
    return
  }

  throw new Error(
    `Could not find a rename target from candidates: ${fromCandidates.join(', ')}`,
  )
}

const readLatestWorkspaceSnapshot = async (page: import('@playwright/test').Page) => {
  return page.evaluate(async () => {
    const dbName = 'knighted-develop-workspaces'
    const storeName = 'prWorkspaces'

    const openDb = await new Promise<IDBDatabase | null>(resolve => {
      try {
        const request = indexedDB.open(dbName)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })

    if (!openDb) {
      return null
    }

    const records = await new Promise<Array<Record<string, unknown>>>(resolve => {
      try {
        const transaction = openDb.transaction(storeName, 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.getAll()
        request.onsuccess = () => {
          const value = Array.isArray(request.result) ? request.result : []
          resolve(value as Array<Record<string, unknown>>)
        }
        request.onerror = () => resolve([])
      } catch {
        resolve([])
      }
    })

    openDb.close()

    if (!Array.isArray(records) || records.length === 0) {
      return null
    }

    const sorted = [...records].sort((a, b) => {
      const first =
        typeof a.lastModified === 'number' && Number.isFinite(a.lastModified)
          ? a.lastModified
          : 0
      const second =
        typeof b.lastModified === 'number' && Number.isFinite(b.lastModified)
          ? b.lastModified
          : 0
      return second - first
    })

    const latest = sorted[0] ?? {}
    const tabs = Array.isArray(latest.tabs) ? latest.tabs : []
    const primaryStylesTab = tabs.find(tab => {
      if (!tab || typeof tab !== 'object') {
        return false
      }

      const tabRecord = tab as Record<string, unknown>
      const language = typeof tabRecord.language === 'string' ? tabRecord.language : ''
      const path = typeof tabRecord.path === 'string' ? tabRecord.path : ''
      const name = typeof tabRecord.name === 'string' ? tabRecord.name : ''
      const isStyleLanguage = ['css', 'less', 'sass', 'module'].includes(language)
      const styleIdentity = `${path} ${name}`.toLowerCase()
      const looksLikeStyle = /\.(css|less|sass|scss)\b/.test(styleIdentity)
      return isStyleLanguage && looksLikeStyle
    }) as Record<string, unknown> | undefined

    return {
      renderMode: typeof latest.renderMode === 'string' ? latest.renderMode : '',
      styleLanguage:
        typeof primaryStylesTab?.language === 'string' ? primaryStylesTab.language : '',
    }
  })
}

const readPreviewUserStyleText = async (page: import('@playwright/test').Page) => {
  return getPreviewFrame(page)
    .locator('html')
    .evaluate(() => {
      const userStyleElement = document.getElementById('knighted-preview-user-styles')
      if (!(userStyleElement instanceof HTMLStyleElement)) {
        return ''
      }

      return userStyleElement.textContent ?? ''
    })
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

test('react mode keeps App.ts entry but surfaces rename guidance until compatible', async ({
  page,
}) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')

  await renameWorkspaceTab(page, {
    from: 'App.tsx',
    to: 'App.ts',
  })

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')

  const expectedMessage =
    'React mode requires the entry tab to end in .tsx, .jsx, or .js.'
  await expect(page.getByRole('status', { name: 'App status' })).toContainText(
    expectedMessage,
  )
  await expect(page.locator('#preview-host pre.preview-runtime-error')).toContainText(
    expectedMessage,
  )

  await renameWorkspaceTab(page, {
    from: 'App.ts',
    to: 'App.jsx',
  })

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('css module imports expose class map for module tabs', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await renameWorkspaceTab(page, {
    from: 'app.css',
    to: 'app.module.css',
  })

  await setWorkspaceTabSource(page, {
    fileName: 'app.module.css',
    kind: 'styles',
    source: [
      '.list {',
      '  display: grid;',
      '}',
      '',
      '.item {',
      '  color: rgb(10, 20, 30);',
      '}',
    ].join('\n'),
  })

  await addWorkspaceTab(page, { type: 'script' })
  await renameWorkspaceTab(page, {
    from: 'module.tsx',
    to: 'list.tsx',
  })
  await setWorkspaceTabSource(page, {
    fileName: 'list.tsx',
    source: [
      "import styles from '../styles/app.module.css'",
      "import { Item } from './item'",
      '',
      'type ListProps = {',
      '  items: string[]',
      '}',
      '',
      'export const List = ({ items }: ListProps) => (',
      '  <ul className={styles.list}>',
      '    {items.map(item => (',
      '      <Item key={item} value={item} />',
      '    ))}',
      '  </ul>',
      ')',
    ].join('\n'),
  })

  await addWorkspaceTab(page, { type: 'script' })
  await renameWorkspaceTabFromCandidates(page, {
    fromCandidates: ['module-2.tsx', 'module.tsx', 'module-1.tsx'],
    to: 'item.tsx',
  })
  await setWorkspaceTabSource(page, {
    fileName: 'item.tsx',
    source: [
      "import styles from '../styles/app.module.css'",
      '',
      'type ItemProps = {',
      '  value: string',
      '}',
      '',
      'export const Item = ({ value }: ItemProps) => (',
      '  <li className={styles.item}>{value}</li>',
      ')',
    ].join('\n'),
  })

  await setComponentEditorSource(
    page,
    [
      "import { List } from './list'",
      '',
      "const items = ['one', 'two']",
      '',
      'const App = () => <List items={items} />',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(getPreviewFrame(page).getByRole('listitem')).toHaveCount(2)
  await expect(getPreviewFrame(page).getByRole('listitem').first()).toHaveCSS(
    'color',
    'rgb(10, 20, 30)',
  )
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
      return readPreviewUserStyleText(page)
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
      return readPreviewUserStyleText(page)
    })
    .not.toContain('rgb(1, 2, 3)')
})

test('top-level @import in user css is applied in preview iframe', async ({ page }) => {
  await waitForInitialRender(page)

  const importedCss = encodeURIComponent('.counter-button { color: rgb(11, 22, 33); }')

  await setWorkspaceTabSource(page, {
    fileName: 'app.css',
    kind: 'styles',
    source: [
      `@import url("data:text/css,${importedCss}");`,
      '.counter-button { font-weight: 700; }',
    ].join('\n'),
  })

  await setComponentEditorSource(
    page,
    [
      "import '../styles/app.css'",
      '',
      'const App = () => <button class="counter-button">Imported style</button>',
      '',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  await expect
    .poll(async () => {
      return getPreviewFrame(page)
        .getByRole('button', { name: 'Imported style' })
        .evaluate(element => getComputedStyle(element).color)
    })
    .toBe('rgb(11, 22, 33)')
})

test('preview iframe keeps one base and one user style node across rerenders', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setWorkspaceTabSource(page, {
    fileName: 'app.css',
    kind: 'styles',
    source: ['.counter-button { color: rgb(40, 50, 60); }'].join('\n'),
  })

  await page.getByLabel('Background').fill('#123456')

  await setWorkspaceTabSource(page, {
    fileName: 'app.css',
    kind: 'styles',
    source: ['.counter-button { color: rgb(70, 80, 90); }'].join('\n'),
  })

  await expect
    .poll(async () => {
      return getPreviewFrame(page)
        .locator('html')
        .evaluate(() => {
          const baseStyleElements = document.querySelectorAll(
            '#knighted-preview-base-styles',
          )
          const userStyleElements = document.querySelectorAll(
            '#knighted-preview-user-styles',
          )

          const baseStyleElement = document.getElementById('knighted-preview-base-styles')
          const userStyleElement = document.getElementById('knighted-preview-user-styles')

          if (
            !(baseStyleElement instanceof HTMLStyleElement) ||
            !(userStyleElement instanceof HTMLStyleElement)
          ) {
            return {
              baseCount: baseStyleElements.length,
              userCount: userStyleElements.length,
              ordered: false,
              userText: '',
            }
          }

          const styleElements = Array.from(document.head.querySelectorAll('style'))
          const baseIndex = styleElements.indexOf(baseStyleElement)
          const userIndex = styleElements.indexOf(userStyleElement)

          return {
            baseCount: baseStyleElements.length,
            userCount: userStyleElements.length,
            ordered: baseIndex >= 0 && userIndex >= 0 && baseIndex < userIndex,
            userText: userStyleElement.textContent ?? '',
          }
        })
    })
    .toMatchObject({
      baseCount: 1,
      userCount: 1,
      ordered: true,
    })

  await expect
    .poll(async () => {
      return readPreviewUserStyleText(page)
    })
    .toContain('rgb(70, 80, 90)')
})

test('nested module imports can bring styles into preview graph', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page, { type: 'script' })
  await addWorkspaceTab(page, { type: 'style' })

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
      return readPreviewUserStyleText(page)
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

test('missing component identifiers in App render as runtime errors', async ({
  page,
}) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')

  await setComponentEditorSource(
    page,
    [
      'const App = () => (',
      '  <List>',
      '    <Item value="one" />',
      '  </List>',
      ')',
    ].join('\n'),
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText('[runtime]')
  await expect(page.locator('#preview-host pre')).toContainText(
    /List is not defined|Can't find variable:\s*List/,
  )
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

test('auto render shows App-only error in dom and react modes when App is missing', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">implicit app dom</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Expected a function or const named App.',
  )

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await expect(page.getByRole('combobox', { name: 'Render mode' })).toHaveValue('react')
  await setComponentEditorSource(
    page,
    'const Button = () => <button type="button">implicit app react</button>',
  )
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('implicit app react')

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Expected a function or const named App.',
  )
})

test('auto render renders successfully when explicit App is defined in dom and react modes', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    'const App = () => <button type="button">explicit app dom</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'explicit app dom',
  )

  await page.getByRole('combobox', { name: 'Render mode' }).selectOption('react')
  await expect(page.getByRole('combobox', { name: 'Render mode' })).toHaveValue('react')
  await setComponentEditorSource(
    page,
    'const App = () => <button type="button">explicit app react</button>',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expect(getPreviewFrame(page).getByRole('button')).toContainText(
    'explicit app react',
  )
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

test('auto render shows App-only error for standalone JSX expression', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    '(<button type="button">implicit app from jsx expression</button>) as any; // trailing',
  )

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Error')
  await expect(page.locator('#preview-host pre')).toContainText(
    'Expected a function or const named App.',
  )
})

test('auto render shows App-only error for declarations plus top-level JSX expression', async ({
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
    'Expected a function or const named App.',
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

  await expect
    .poll(async () => (await readLatestWorkspaceSnapshot(page))?.renderMode ?? '')
    .toBe('react')

  await page.reload()
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'component')

  await expect(page.getByRole('combobox', { name: 'Render mode' })).toHaveValue('react')
})

test('persists style mode across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')
  await page.getByRole('combobox', { name: 'Style mode' }).selectOption('sass')
  await expect(page.locator('#style-mode')).toHaveValue('sass')
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')

  await expect
    .poll(async () => (await readLatestWorkspaceSnapshot(page))?.styleLanguage ?? '')
    .toBe('sass')

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.locator('#style-mode')).toHaveValue('sass')
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
