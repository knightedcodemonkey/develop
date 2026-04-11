import { expect, test } from '@playwright/test'
import {
  addWorkspaceTab,
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

  await page.getByRole('tab', { name: 'Open tab module-2.tsx' }).click()
  await expect(page.getByRole('tab', { name: 'Open tab module-2.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await page.getByRole('button', { name: 'Remove tab module-2.tsx' }).click()
  await confirmRemoveDialog(page)

  await expect(page.getByRole('tab', { name: 'Open tab module-2.tsx' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Open tab module-3.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('removing non-active tab does not change active tab', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await page.getByRole('tab', { name: 'Open tab module-3.tsx' }).click()
  await expect(page.getByRole('tab', { name: 'Open tab module-3.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await page.getByRole('button', { name: 'Remove tab module-2.tsx' }).click()
  await confirmRemoveDialog(page)

  await expect(page.getByRole('tab', { name: 'Open tab module-2.tsx' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Open tab module-3.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('renaming module tab keeps name and path synchronized', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await renameWorkspaceTab(page, {
    from: 'module.tsx',
    to: 'card-item.tsx',
  })

  const tab = page.getByRole('tab', { name: 'Open tab card-item.tsx' })
  await expect(tab).toHaveAttribute('title', 'src/components/card-item.tsx')
  await expect(page.getByRole('tab', { name: 'Open tab module.tsx' })).toHaveCount(0)
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

  await page.getByRole('tab', { name: 'Open tab App.tsx' }).click()
  await page.getByRole('tab', { name: 'Open tab value-card.tsx' }).click()

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

  await page.getByRole('tab', { name: 'Open tab app.css' }).click()
  await expect(page.getByRole('tab', { name: 'Open tab app.css' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(stylesPanel).not.toHaveAttribute('hidden', '')
  await expect(componentPanel).toHaveAttribute('hidden', '')

  await page.getByRole('tab', { name: 'Open tab module-2.tsx' }).click()
  await expect(page.getByRole('tab', { name: 'Open tab module-2.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(componentPanel).not.toHaveAttribute('hidden', '')
  await expect(stylesPanel).toHaveAttribute('hidden', '')

  await page.locator('#collapse-component').click()
  await page.getByRole('tab', { name: 'Open tab app.css' }).click()

  await expect(page.getByRole('tab', { name: 'Open tab app.css' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(stylesPanel).not.toHaveAttribute('hidden', '')
  await expect(componentPanel).toHaveAttribute('hidden', '')
})

test('startup restores last active workspace tab after reload', async ({ page }) => {
  await waitForInitialRender(page)

  await addWorkspaceTab(page)
  await addWorkspaceTab(page)

  await page.getByRole('tab', { name: 'Open tab module-2.tsx' }).click()
  await expect(page.getByRole('tab', { name: 'Open tab module-2.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.getByRole('tab', { name: 'Open tab module-2.tsx' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('#editor-panel-component')).not.toHaveAttribute('hidden', '')
  await expect(page.locator('#editor-panel-styles')).toHaveAttribute('hidden', '')
})
