import { expect, test } from '@playwright/test'
import {
  addWorkspaceTab,
  ensurePanelToolsVisible,
  reorderWorkspaceTabBefore,
  setWorkspaceTabSource,
  waitForInitialRender,
} from './helpers/app-test-helpers.js'

const confirmRemoveDialog = async (page: import('@playwright/test').Page) => {
  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toBeVisible()

  await dialog.locator('button[value="confirm"]').evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })
}

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

test('removing active tab selects deterministic adjacent tab', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await page.getByRole('button', { name: 'Open tab module-2.tsx' }).click()
  await expect(
    page.getByRole('button', { name: 'Open tab module-2.tsx' }),
  ).toHaveAttribute('aria-current', 'true')

  await page.getByRole('button', { name: 'Remove tab module-2.tsx' }).click()
  await confirmRemoveDialog(page)

  await expect(page.getByRole('button', { name: 'Open tab module-2.tsx' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Open tab module-3.tsx' }),
  ).toHaveAttribute('aria-current', 'true')
})

test('removing non-active tab does not change active tab', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await page.getByRole('button', { name: 'Open tab module-3.tsx' }).click()
  await expect(
    page.getByRole('button', { name: 'Open tab module-3.tsx' }),
  ).toHaveAttribute('aria-current', 'true')

  await page.getByRole('button', { name: 'Remove tab module-2.tsx' }).click()
  await confirmRemoveDialog(page)

  await expect(page.getByRole('button', { name: 'Open tab module-2.tsx' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Open tab module-3.tsx' }),
  ).toHaveAttribute('aria-current', 'true')
})

test('renaming module tab keeps name and path synchronized', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await renameWorkspaceTab(page, {
    from: 'module.tsx',
    to: 'card-item.tsx',
  })

  const tab = page.getByRole('button', { name: 'Open tab card-item.tsx' })
  await expect(tab).toHaveAttribute('title', 'src/components/card-item.tsx')
  await expect(page.getByRole('button', { name: 'Open tab module.tsx' })).toHaveCount(0)
})

test('renaming module tab preserves source content', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await setWorkspaceTabSource(page, {
    fileName: 'module.tsx',
    source: 'export const Value = () => <p>Kept</p>',
    kind: 'component',
  })

  await renameWorkspaceTab(page, {
    from: 'module.tsx',
    to: 'value-card.tsx',
  })

  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
  await page.getByRole('button', { name: 'Open tab value-card.tsx' }).click()

  const editorContent = page
    .locator('.editor-panel[data-editor-kind="component"] .cm-content')
    .first()
  await expect(editorContent).toContainText('export const Value = () => <p>Kept</p>')
})

test('active tab remains source of truth for visible editor panel', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  const componentPanel = page.locator('#editor-panel-component')
  const stylesPanel = page.locator('#editor-panel-styles')

  await page.getByRole('button', { name: 'Open tab app.css' }).click()
  await expect(page.getByRole('button', { name: 'Open tab app.css' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(stylesPanel).not.toHaveAttribute('hidden', '')
  await expect(componentPanel).toHaveAttribute('hidden', '')

  await page.getByRole('button', { name: 'Open tab module-2.tsx' }).click()
  await expect(
    page.getByRole('button', { name: 'Open tab module-2.tsx' }),
  ).toHaveAttribute('aria-current', 'true')
  await expect(componentPanel).not.toHaveAttribute('hidden', '')
  await expect(stylesPanel).toHaveAttribute('hidden', '')

  await page.locator('#collapse-component').click()
  await page.getByRole('button', { name: 'Open tab app.css' }).click()

  await expect(page.getByRole('button', { name: 'Open tab app.css' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(stylesPanel).not.toHaveAttribute('hidden', '')
  await expect(componentPanel).toHaveAttribute('hidden', '')
})

test('render mode can only be changed from entry tab', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await ensurePanelToolsVisible(page, 'component')

  const renderMode = page.getByRole('combobox', { name: 'Render mode' })

  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
  await expect(renderMode).toBeEnabled()
  await renderMode.selectOption('react')
  await expect(renderMode).toHaveValue('react')

  await page.getByRole('button', { name: 'Open tab module.tsx' }).click()
  await expect(renderMode).toBeDisabled()
  await expect(renderMode).toHaveValue('react')

  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
  await expect(renderMode).toBeEnabled()
  await expect(renderMode).toHaveValue('react')
})

test('startup restores last active workspace tab after reload', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await page.getByRole('button', { name: 'Open tab module-2.tsx' }).click()
  await expect(
    page.getByRole('button', { name: 'Open tab module-2.tsx' }),
  ).toHaveAttribute('aria-current', 'true')

  await page.reload()
  await waitForInitialRender(page)

  await expect(
    page.getByRole('button', { name: 'Open tab module-2.tsx' }),
  ).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('#editor-panel-component')).not.toHaveAttribute('hidden', '')
  await expect(page.locator('#editor-panel-styles')).toHaveAttribute('hidden', '')
})

test('workspace tab drag reorder persists across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await reorderWorkspaceTabBefore(page, {
    from: 'module-2.tsx',
    to: 'App.tsx',
  })

  const orderedTabs = page
    .getByRole('list', { name: 'Workspace editor tabs' })
    .getByRole('listitem')
  await expect(orderedTabs.nth(0)).toHaveAccessibleName('Workspace tab module-2.tsx')
  await expect(orderedTabs.nth(1)).toHaveAccessibleName('Workspace tab App.tsx')

  await page.reload()
  await waitForInitialRender(page)

  const restoredTabs = page
    .getByRole('list', { name: 'Workspace editor tabs' })
    .getByRole('listitem')
  await expect(restoredTabs.nth(0)).toHaveAccessibleName('Workspace tab module-2.tsx')
  await expect(restoredTabs.nth(1)).toHaveAccessibleName('Workspace tab App.tsx')
})

test('workspace tab drag onto itself keeps order unchanged', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  const labelsBefore = await page
    .getByRole('list', { name: 'Workspace editor tabs' })
    .getByRole('listitem')
    .evaluateAll(nodes =>
      nodes
        .map(node => node.getAttribute('aria-label'))
        .filter((label): label is string => typeof label === 'string'),
    )

  await reorderWorkspaceTabBefore(page, {
    from: 'App.tsx',
    to: 'App.tsx',
  })

  const labelsAfter = await page
    .getByRole('list', { name: 'Workspace editor tabs' })
    .getByRole('listitem')
    .evaluateAll(nodes =>
      nodes
        .map(node => node.getAttribute('aria-label'))
        .filter((label): label is string => typeof label === 'string'),
    )

  expect(labelsAfter).toEqual(labelsBefore)
})

test('add menu can create styles tab while component tab is active', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
  await addWorkspaceTab(page, { kind: 'styles' })

  await expect(page.getByRole('button', { name: 'Open tab module.css' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(page.locator('#editor-panel-styles')).not.toHaveAttribute('hidden', '')
  await expect(page.locator('#editor-panel-component')).toHaveAttribute('hidden', '')
  await expect(page.getByRole('status', { name: 'App status' })).toContainText(
    'Added style tab.',
  )
})

test('add menu stays closed until triggered and closes on outside click', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const addButton = page.getByRole('button', { name: 'Add workspace tab' })
  const addMenu = page.getByRole('group', { name: 'Add workspace tab' })

  await expect(addMenu).toBeHidden()
  await addButton.click()
  await expect(addMenu).toBeVisible()

  await page.getByRole('status', { name: 'App status' }).click()
  await expect(addMenu).toBeHidden()
})

test('add menu keyboard interaction manages focus on open and escape close', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const addButton = page.getByRole('button', { name: 'Add workspace tab' })
  const addMenu = page.getByRole('group', { name: 'Add workspace tab' })
  const addModuleButton = page.getByRole('button', { name: 'Add module tab' })

  await addButton.focus()
  await page.keyboard.press('ArrowDown')

  await expect(addMenu).toBeVisible()
  await expect(addModuleButton).toBeFocused()

  await page.keyboard.press('Escape')

  await expect(addMenu).toBeHidden()
  await expect(addButton).toBeFocused()
})
