import { expect, test } from '@playwright/test'
import {
  addWorkspaceTab,
  ensurePanelToolsVisible,
  resetWorkbenchStorage,
  setWorkspaceTabSource,
  waitForInitialRender,
} from '../helpers/app-test-helpers.js'

test.beforeEach(async ({ page }) => {
  await resetWorkbenchStorage(page)
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
