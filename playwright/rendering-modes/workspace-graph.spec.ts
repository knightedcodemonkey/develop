import { expect, test } from '@playwright/test'
import {
  addWorkspaceTab,
  ensurePanelToolsVisible,
  getPreviewFrame,
  openWorkspaceTab,
  resetWorkbenchStorage,
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

test.beforeEach(async ({ page }) => {
  await resetWorkbenchStorage(page)
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
