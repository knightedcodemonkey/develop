import { expect, test } from '@playwright/test'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  resetWorkbenchStorage,
  setComponentEditorSource,
  waitForAppReady,
} from './helpers/app-test-helpers.js'
const installClipboardCapture = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    let copied = ''

    Object.defineProperty(window, '__shareClipboardText', {
      configurable: true,
      get: () => copied,
      set: value => {
        copied = typeof value === 'string' ? value : String(value ?? '')
      },
    })

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as { __shareClipboardText?: string }).__shareClipboardText =
            typeof text === 'string' ? text : String(text ?? '')
        },
        readText: async () => {
          return (window as { __shareClipboardText?: string }).__shareClipboardText ?? ''
        },
      },
    })
  })
}

const getWorkspaceRecords = async (page: import('@playwright/test').Page) => {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('knighted-develop-workspaces')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
    })

    try {
      const transaction = db.transaction('prWorkspaces', 'readonly')
      const store = transaction.objectStore('prWorkspaces')
      const request = store.getAll()

      return await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        request.onsuccess = () => {
          const value = Array.isArray(request.result) ? request.result : []
          resolve(value as Array<Record<string, unknown>>)
        }
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  })
}

const encodeSharePayload = async (
  page: import('@playwright/test').Page,
  snapshot: Record<string, unknown>,
) => {
  return page.evaluate(async sourceSnapshot => {
    const toBase64Url = (bytes: Uint8Array) => {
      const chunkSize = 0x8000
      let binary = ''
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
      }

      const base64 = btoa(binary)
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    }

    const source = JSON.stringify({
      version: 1,
      compression: 'gzip',
      createdAt: Date.now(),
      snapshot: sourceSnapshot,
    })

    const sourceBytes = new TextEncoder().encode(source)
    const sourceStream = new Blob([sourceBytes]).stream()
    const compressedStream = sourceStream.pipeThrough(new CompressionStream('gzip'))
    const compressedBuffer = await new Response(compressedStream).arrayBuffer()
    return toBase64Url(new Uint8Array(compressedBuffer))
  }, snapshot)
}

test('share button is shown for local workspace and copies a share URL', async ({
  page,
}) => {
  await installClipboardCapture(page)
  await waitForAppReady(page, `${appEntryPath}`)

  await page.getByRole('button', { name: 'Workspaces' }).click()

  const shareButton = page
    .locator('#workspaces-drawer')
    .getByRole('button', { name: 'Share local workspace snapshot' })
  await expect(shareButton).toBeVisible()

  await setComponentEditorSource(
    page,
    "export const App = () => <main data-share='ready'>Shared local snapshot</main>",
  )

  await shareButton.click()
  await expect(page.getByRole('status', { name: 'App status' })).toContainText(
    'Share link copied',
  )

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as { __shareClipboardText?: string }).__shareClipboardText ?? ''
      })
    })
    .not.toBe('')

  const copiedUrl = await page.evaluate(() => {
    return (window as { __shareClipboardText?: string }).__shareClipboardText ?? ''
  })

  const copiedPayload = new URL(copiedUrl).searchParams.get('sws')
  expect(copiedPayload).toBeTruthy()
})

test('share button appears in workspaces drawer and not in editor controls', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)

  await expect(
    page
      .locator('#editor-header-component')
      .getByRole('button', { name: 'Share local workspace snapshot' }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Workspaces' }).click()

  await expect(
    page
      .locator('#workspaces-drawer')
      .getByRole('button', { name: 'Share local workspace snapshot' }),
  ).toBeVisible()
})

test('share button is hidden in drawer for non-Local repository filter', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)

  await page.getByRole('button', { name: 'Workspaces' }).click()

  const repositoryFilter = page.getByLabel('Workspace repository filter')
  await expect(repositoryFilter).toHaveValue('knightedcodemonkey/develop')

  const drawerShareButton = page
    .locator('#workspaces-drawer')
    .getByRole('button', { name: 'Share local workspace snapshot' })
  await expect(drawerShareButton).toBeHidden()
})

test('loads shared URL snapshot into IDB as a new local workspace and clears URL param', async ({
  page,
}) => {
  await installClipboardCapture(page)
  await resetWorkbenchStorage(page)

  const sharedSnapshot = {
    id: 'external-source-id',
    workspaceScope: 'repository',
    repo: 'knightedcodemonkey/develop',
    base: 'main',
    head: 'shared/feature-branch',
    prNumber: 123,
    prTitle: 'Imported snapshot',
    prContextState: 'active',
    renderMode: 'dom',
    tabs: [
      {
        id: 'entry',
        name: 'SharedEntry.tsx',
        path: 'src/components/SharedEntry.tsx',
        language: 'javascript-jsx',
        role: 'entry',
        isActive: true,
        content: 'export const App = () => <main>Shared import content</main>',
      },
    ],
    activeTabId: 'entry',
    createdAt: Date.now() - 1000,
    lastModified: Date.now() - 1000,
    schemaVersion: 1,
  }

  const encodedPayload = await encodeSharePayload(page, sharedSnapshot)
  await waitForAppReady(page, `${appEntryPath}?sws=${encodeURIComponent(encodedPayload)}`)

  await expect
    .poll(() => {
      const currentUrl = new URL(page.url())
      return currentUrl.searchParams.has('sws')
    })
    .toBe(false)

  await expect
    .poll(async () => {
      const records = await getWorkspaceRecords(page)
      const imported = records.find(record => {
        if (!record || typeof record !== 'object') {
          return false
        }

        const tabs = Array.isArray(record.tabs) ? record.tabs : []
        return tabs.some(tab => {
          if (!tab || typeof tab !== 'object') {
            return false
          }

          return (
            typeof tab.content === 'string' &&
            tab.content.includes('Shared import content')
          )
        })
      })

      if (!imported || typeof imported !== 'object') {
        return null
      }

      const tabs = Array.isArray(imported.tabs) ? imported.tabs : []
      const firstTab = tabs[0] && typeof tabs[0] === 'object' ? tabs[0] : null
      return {
        workspaceScope:
          typeof imported.workspaceScope === 'string' ? imported.workspaceScope : '',
        repo: typeof imported.repo === 'string' ? imported.repo : '',
        prNumber: imported.prNumber,
        prContextState:
          typeof imported.prContextState === 'string' ? imported.prContextState : '',
        hasImportedContent: tabs.some(tab => {
          if (!tab || typeof tab !== 'object') {
            return false
          }

          return (
            typeof tab.content === 'string' &&
            tab.content.includes('Shared import content')
          )
        }),
        firstTabContent:
          firstTab && typeof firstTab.content === 'string' ? firstTab.content : '',
      }
    })
    .toEqual({
      workspaceScope: 'local',
      repo: '',
      prNumber: null,
      prContextState: 'inactive',
      hasImportedContent: true,
      firstTabContent: expect.any(String),
    })
})

test('invalid shared payload does not crash app and keeps URL param for retry', async ({
  page,
}) => {
  await installClipboardCapture(page)
  await resetWorkbenchStorage(page)

  await waitForAppReady(page, `${appEntryPath}?sws=this-is-not-valid`)

  await expect(page.getByRole('button', { name: 'Open tab App.tsx' })).toBeVisible()

  await expect
    .poll(() => {
      const currentUrl = new URL(page.url())
      return currentUrl.searchParams.get('sws')
    })
    .toBe('this-is-not-valid')
})
