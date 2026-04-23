import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type {
  CreateRefRequestBody,
  PullRequestCreateBody,
} from './helpers/app-test-helpers.js'
import {
  addWorkspaceTab,
  appEntryPath,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForAppReady,
} from './helpers/app-test-helpers.js'

const getOpenPrDrawer = (page: Page) =>
  page.getByRole('complementary', { name: /Open Pull Request|Push Commit/ })

const renameWorkspaceTab = async (
  page: Page,
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

const clickOpenPrDrawerSubmit = async (page: Page) => {
  const drawer = getOpenPrDrawer(page)
  await expect(drawer).toBeVisible()
  const submitButton = drawer.getByRole('button', { name: 'Open PR' })
  await expect(submitButton).toBeEnabled()
  /*
   * NOTE: WebKit's HTML <dialog> Top Layer behavior can cause Playwright
   * actionability checks to fail or time out, even when the control is
   * visibly ready and works in Safari.
   *
   * Keep this evaluate-based click because standard locator.click() and
   * locator.click({ force: true }) have been flaky here and can fail to
   * resolve the hit target for this drawer flow.
   */
  await submitButton.evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })
}

const triggerOpenPrConfirmation = async (page: Page) => {
  await clickOpenPrDrawerSubmit(page)
  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

const submitOpenPrAndConfirm = async (
  page: Page,
  {
    expectedSummaryLines,
  }: {
    expectedSummaryLines?: string[]
  } = {},
) => {
  const dialog = await triggerOpenPrConfirmation(page)

  for (const line of expectedSummaryLines ?? []) {
    await expect(dialog.getByText(line, { exact: true })).toBeVisible()
  }

  /* Same WebKit <dialog> Top Layer issue applies to the confirm button. */
  await dialog.locator('button[value="confirm"]').evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })
}

const expectOpenPrConfirmationPrompt = async (page: Page) => {
  const dialog = await triggerOpenPrConfirmation(page)
  await expect(dialog).toBeVisible()
}

const removeSavedGitHubToken = async (page: Page) => {
  await page.getByRole('button', { name: 'Delete GitHub token' }).click()

  const dialog = page.getByRole('dialog', {
    name: 'Remove saved GitHub token?',
    includeHidden: true,
  })

  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
}

const openMostRecentStoredWorkspaceContext = async (page: Page) => {
  await page.getByRole('button', { name: 'Workspaces' }).click()

  const select = page.locator('#workspaces-select')
  await expect(select).toBeVisible()

  const firstContextId = await select.evaluate(element => {
    if (!(element instanceof HTMLSelectElement)) {
      return ''
    }

    const option = Array.from(element.options).find(candidate => candidate.value)
    return option?.value ?? ''
  })

  expect(firstContextId).not.toBe('')
  await select.selectOption(firstContextId)
  await page.locator('#workspaces-open').click()
}

const seedLocalWorkspaceContexts = async (
  page: Page,
  contexts: Array<{
    id: string
    repo: string
    base?: string
    head: string
    prTitle: string
    prNumber?: number | null
    prContextState?: 'inactive' | 'active' | 'disconnected' | 'closed'
    renderMode?: 'dom' | 'react'
    tabs?: Array<Record<string, unknown>>
    activeTabId?: string | null
    createdAt?: number
    lastModified?: number
  }>,
) => {
  await page.evaluate(async inputContexts => {
    const request = indexedDB.open('knighted-develop-workspaces')

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
    })

    try {
      const tx = db.transaction('prWorkspaces', 'readwrite')
      const store = tx.objectStore('prWorkspaces')
      const now = Date.now()

      for (const context of inputContexts) {
        const putRequest = store.put({
          id: context.id,
          repo: context.repo,
          base: context.base ?? 'main',
          head: context.head,
          prTitle: context.prTitle,
          prNumber:
            typeof context.prNumber === 'number' && Number.isFinite(context.prNumber)
              ? context.prNumber
              : null,
          prContextState:
            typeof context.prContextState === 'string' && context.prContextState.trim()
              ? context.prContextState
              : 'inactive',
          renderMode: context.renderMode === 'react' ? 'react' : 'dom',
          tabs: Array.isArray(context.tabs) ? context.tabs : [],
          activeTabId:
            typeof context.activeTabId === 'string' ? context.activeTabId : 'component',
          schemaVersion: 1,
          createdAt:
            typeof context.createdAt === 'number' && Number.isFinite(context.createdAt)
              ? context.createdAt
              : now,
          lastModified:
            typeof context.lastModified === 'number' &&
            Number.isFinite(context.lastModified)
              ? context.lastModified
              : now,
        })

        await new Promise<void>((resolve, reject) => {
          putRequest.onsuccess = () => resolve()
          putRequest.onerror = () => reject(putRequest.error)
        })
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, contexts)
}

const toWorkspaceIdentitySegment = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const buildWorkspaceRecordId = ({
  repositoryFullName,
  headBranch,
}: {
  repositoryFullName: string
  headBranch: string
}) => {
  const repoSegment = toWorkspaceIdentitySegment(repositoryFullName)
  const headSegment = toWorkspaceIdentitySegment(headBranch) || 'draft'
  return repoSegment ? `repo_${repoSegment}_${headSegment}` : `workspace_${headSegment}`
}

const seedActivePrWorkspaceContext = async (
  page: Page,
  {
    repositoryFullName,
    baseBranch = 'main',
    headBranch,
    prTitle,
    prNumber,
    renderMode = 'react',
    styleLanguage = 'css',
  }: {
    repositoryFullName: string
    baseBranch?: string
    headBranch: string
    prTitle: string
    prNumber: number
    renderMode?: 'dom' | 'react'
    styleLanguage?: 'css' | 'sass' | 'less'
  },
) => {
  const safeStyleLanguage =
    styleLanguage === 'sass' || styleLanguage === 'less' ? styleLanguage : 'css'

  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch,
      }),
      repo: repositoryFullName,
      base: baseBranch,
      head: headBranch,
      prTitle,
      prNumber,
      prContextState: 'active',
      renderMode,
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Hello from Knighted</main>',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: safeStyleLanguage,
          role: 'module',
          isActive: false,
          content: 'main { color: #111; }',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() + 60_000,
      lastModified: Date.now() + 60_000,
    },
  ])
}

const getLocalContextOptionLabels = async (page: Page) => {
  return page
    .getByLabel('Stored local editor contexts')
    .locator('option')
    .evaluateAll(nodes => nodes.map(node => node.textContent?.trim() || ''))
}

const getWorkspaceTabsRecord = async (
  page: Page,
  { headBranch = '' }: { headBranch?: string } = {},
) => {
  return page.evaluate(
    async input => {
      const request = indexedDB.open('knighted-develop-workspaces')

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
      })

      try {
        const tx = db.transaction('prWorkspaces', 'readonly')
        const store = tx.objectStore('prWorkspaces')
        const getAllRequest = store.getAll()

        const records = await new Promise<Array<Record<string, unknown>>>(
          (resolve, reject) => {
            getAllRequest.onsuccess = () => {
              const value = Array.isArray(getAllRequest.result)
                ? getAllRequest.result
                : []
              resolve(value as Array<Record<string, unknown>>)
            }
            getAllRequest.onerror = () => reject(getAllRequest.error)
          },
        )

        const normalizedHead =
          typeof input?.headBranch === 'string'
            ? input.headBranch.trim().toLowerCase()
            : ''

        if (normalizedHead) {
          const matched = records.find(record => {
            const headValue =
              typeof record?.head === 'string' ? record.head.trim().toLowerCase() : ''
            return headValue === normalizedHead
          })

          if (matched) {
            return matched
          }
        }

        const sortedByLastModified = [...records].sort((left, right) => {
          const leftModified =
            typeof left?.lastModified === 'number' ? left.lastModified : 0
          const rightModified =
            typeof right?.lastModified === 'number' ? right.lastModified : 0
          return rightModified - leftModified
        })

        return sortedByLastModified[0] ?? null
      } finally {
        db.close()
      }
    },
    { headBranch },
  )
}

const getAllWorkspaceRecords = async (page: Page) => {
  return page.evaluate(async () => {
    const request = indexedDB.open('knighted-develop-workspaces')

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
    })

    try {
      const tx = db.transaction('prWorkspaces', 'readonly')
      const store = tx.objectStore('prWorkspaces')
      const getAllRequest = store.getAll()

      const records = await new Promise<Array<Record<string, unknown>>>(
        (resolve, reject) => {
          getAllRequest.onsuccess = () => {
            const value = Array.isArray(getAllRequest.result) ? getAllRequest.result : []
            resolve(value as Array<Record<string, unknown>>)
          }
          getAllRequest.onerror = () => reject(getAllRequest.error)
        },
      )

      return records
    } finally {
      db.close()
    }
  })
}

test('Open PR drawer confirms and submits component/styles filepaths', async ({
  page,
}) => {
  const customCommitMessage = 'chore: sync develop editor outputs'
  let createdRefBody: CreateRefRequestBody | null = null
  const treeRequests: Array<Record<string, unknown>> = []
  const commitRequests: Array<Record<string, unknown>> = []
  const updateRefRequests: Array<Record<string, unknown>> = []
  const contentsPutRequests: string[] = []
  let pullRequestBody: PullRequestCreateBody | null = null

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123mainsha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/abc123mainsha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'abc123mainsha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      commitRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      if (route.request().method() === 'PATCH') {
        updateRefRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/Develop/Open-Pr-Test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      createdRefBody = route.request().postDataJSON() as CreateRefRequestBody
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      if (route.request().method() === 'PUT') {
        contentsPutRequests.push(route.request().url())
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      pullRequestBody = route.request().postDataJSON() as PullRequestCreateBody
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 42,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/42',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('Develop/Open-Pr-Test')
  await page.getByLabel('PR title').fill('Apply editor updates from develop')
  await page
    .getByLabel('PR description')
    .fill('Generated from editor content in @knighted/develop.')
  await page.getByLabel('Commit message').fill(customCommitMessage)

  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/42',
  )

  const createdRefPayload = createdRefBody as CreateRefRequestBody | null
  const pullRequestPayload = pullRequestBody as PullRequestCreateBody | null

  expect(createdRefPayload?.ref).toBe('refs/heads/Develop/Open-Pr-Test')
  expect(createdRefPayload?.sha).toBe('abc123mainsha')
  expect(treeRequests).toHaveLength(1)
  expect((treeRequests[0]?.tree as Array<Record<string, unknown>>)?.length).toBe(2)
  expect(commitRequests).toHaveLength(1)
  expect(commitRequests[0]?.message).toBe(customCommitMessage)
  expect(updateRefRequests).toHaveLength(1)
  expect(updateRefRequests[0]?.sha).toBe('new-commit-sha')
  expect(contentsPutRequests).toHaveLength(0)
  expect(pullRequestPayload?.head).toBe('Develop/Open-Pr-Test')
  expect(pullRequestPayload?.base).toBe('main')

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request base branch')).toHaveValue('main')
  await expect(page.getByLabel('Head')).toHaveValue('Develop/Open-Pr-Test')
  await expect(page.getByLabel('PR title')).toHaveValue(
    'Apply editor updates from develop',
  )
  await expect(page.getByLabel('PR description')).toBeHidden()
  await expect(page.getByLabel('Commit message')).toBeVisible()
  await expect(page.getByLabel('Commit message')).toHaveValue(customCommitMessage)
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeVisible()
})

test('Open PR success normalizes trailing newline without showing Edited indicators', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123mainsha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/abc123mainsha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'abc123mainsha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/Develop/Open-Pr-Test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 62,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/62',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)

  await setComponentEditorSource(page, 'const App = () => <button>tap me</button>')
  await setStylesEditorSource(page, '.button { color: red; }')
  await addWorkspaceTab(page, { kind: 'styles' })

  const moduleStylesEditor = page
    .locator('.editor-panel[data-editor-kind="styles"] .cm-content')
    .first()
  await moduleStylesEditor.fill('.button { padding: 20px; }')
  await moduleStylesEditor.press('End')
  await moduleStylesEditor.type(' ')
  await moduleStylesEditor.press('Backspace')

  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Head').fill('Develop/Open-Pr-Test')
  await page.getByLabel('PR title').fill('Normalize trailing newline after open PR')

  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/62',
  )

  await expect
    .poll(
      async () => {
        const workspaceRecord = await getWorkspaceTabsRecord(page, {
          headBranch: 'Develop/Open-Pr-Test',
        })
        const tabs = Array.isArray(workspaceRecord?.tabs)
          ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
          : []

        const componentTab = tabs.find(tab => tab?.id === 'component')
        const appStylesTab = tabs.find(
          tab =>
            typeof tab?.path === 'string' && tab.path.trim() === 'src/styles/app.css',
        )
        const moduleStylesTab = tabs.find(
          tab =>
            typeof tab?.path === 'string' &&
            tab.path.trim().startsWith('src/styles/module') &&
            tab.path.trim().endsWith('.css'),
        )

        const componentContent =
          typeof componentTab?.content === 'string' ? componentTab.content : ''
        const appStylesContent =
          typeof appStylesTab?.content === 'string' ? appStylesTab.content : ''
        const moduleStylesContent =
          typeof moduleStylesTab?.content === 'string' ? moduleStylesTab.content : ''

        return {
          componentHasTrailingNewline: componentContent.endsWith('\n'),
          appStylesHasTrailingNewline: appStylesContent.endsWith('\n'),
          moduleStylesHasTrailingNewline: moduleStylesContent.endsWith('\n'),
          componentNotDirty: componentTab?.isDirty === false,
          appStylesNotDirty: appStylesTab?.isDirty === false,
          moduleStylesNotDirty: moduleStylesTab?.isDirty === false,
          componentSynced: componentTab?.syncedContent === componentContent,
          appStylesSynced: appStylesTab?.syncedContent === appStylesContent,
          moduleStylesSynced: moduleStylesTab?.syncedContent === moduleStylesContent,
        }
      },
      { timeout: 10_000 },
    )
    .toEqual({
      componentHasTrailingNewline: true,
      appStylesHasTrailingNewline: true,
      moduleStylesHasTrailingNewline: true,
      componentNotDirty: true,
      appStylesNotDirty: true,
      moduleStylesNotDirty: true,
      componentSynced: true,
      appStylesSynced: true,
      moduleStylesSynced: true,
    })

  await expect(
    page
      .getByRole('listitem', { name: 'Workspace tab App.tsx' })
      .locator('.workspace-tab__dirty-indicator'),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('listitem', { name: 'Workspace tab app.css' })
      .locator('.workspace-tab__dirty-indicator'),
  ).toHaveCount(0)
  await expect(page.locator('#component-dirty-status')).toBeHidden()
  await expect(page.locator('#styles-dirty-status')).toBeHidden()

  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  const componentBlob = treePayload?.find(file => file.path === 'src/components/App.tsx')
  const stylesBlob = treePayload?.find(file => file.path === 'src/styles/app.css')
  expect(typeof componentBlob?.content).toBe('string')
  expect(typeof stylesBlob?.content).toBe('string')
  expect(String(componentBlob?.content).endsWith('\n')).toBe(true)
  expect(String(stylesBlob?.content).endsWith('\n')).toBe(true)
})

test('Open PR drawer can filter stored local contexts by search', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'repo_knightedcodemonkey_develop_feat-alpha',
      repo: 'knightedcodemonkey/develop',
      head: 'feat/alpha',
      prTitle: 'Alpha local context',
    },
    {
      id: 'repo_knightedcodemonkey_develop_feat-beta',
      repo: 'knightedcodemonkey/develop',
      head: 'feat/beta',
      prTitle: 'Beta local context',
    },
  ])

  await connectByotWithSingleRepo(page)
  await page.getByRole('button', { name: 'Workspaces' }).click()

  const search = page.getByLabel('Search stored local contexts')
  await expect(search).toBeEnabled()
  await search.fill('beta')

  const labels = await getLocalContextOptionLabels(page)
  expect(labels).toEqual(['Select a stored local context', 'Beta local context'])
})

test('Open PR keeps inactive workspace record when repository changes', async ({
  page,
}) => {
  const oldRepository = 'knightedcodemonkey/contract-case'
  const newRepository = 'knightedcodemonkey/develop-sandbox'
  const headBranch = 'feat/component-sync'
  const oldWorkspaceId = 'repo_knightedcodemonkey_contract-case_feat-component-sync'

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'contract-case',
          full_name: oldRepository,
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 13,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop-sandbox',
          full_name: newRepository,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [oldRepository]: ['main'],
    [newRepository]: ['main', 'release'],
  })

  await page.route(
    `https://api.github.com/repos/${newRepository}/git/ref/**`,
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ object: { sha: 'branch-head-sha' } }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${newRepository}/git/refs`,
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: `refs/heads/${headBranch}` }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${newRepository}/git/commits/branch-head-sha`,
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'branch-head-sha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${newRepository}/git/trees`,
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${newRepository}/git/commits`,
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${newRepository}/git/refs/**`,
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: `refs/heads/${headBranch}` }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${newRepository}/contents/**`,
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(`https://api.github.com/repos/${newRepository}/pulls`, async route => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        number: 88,
        html_url: `https://github.com/${newRepository}/pull/88`,
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: oldWorkspaceId,
      repo: oldRepository,
      base: 'main',
      head: headBranch,
      prTitle: 'Seeded inactive context',
      prNumber: null,
      prContextState: 'inactive',
      renderMode: 'dom',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Seeded workspace</main>',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'main { color: #111; }',
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  const repoSelect = page.getByLabel('Pull request repository')
  await expect(repoSelect).toHaveValue(oldRepository)

  await page.getByRole('button', { name: 'Workspaces' }).click()
  await page.locator('#workspaces-select').selectOption(oldWorkspaceId)
  await page.locator('#workspaces-open').click()

  await ensureOpenPrDrawerOpen(page)
  await repoSelect.selectOption(newRepository)

  await page.getByLabel('Head').fill(headBranch)
  await page.getByLabel('PR title').fill('Promote inactive context to active PR')

  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(`Pull request opened: https://github.com/${newRepository}/pull/88`)

  const workspaceRecords = await getAllWorkspaceRecords(page)
  const recordsByHead = workspaceRecords.filter(
    record =>
      typeof record?.head === 'string' && record.head.trim().toLowerCase() === headBranch,
  )

  const expectedWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: newRepository,
    headBranch,
  })

  expect(recordsByHead).toHaveLength(1)
  expect(recordsByHead[0]?.id).toBe(expectedWorkspaceId)
  expect(recordsByHead[0]?.repo).toBe(newRepository)
  expect(recordsByHead[0]?.prContextState).toBe('active')
  expect(recordsByHead[0]?.prNumber).toBe(88)

  const staleRepositoryRecords = workspaceRecords.filter(
    record => record?.repo === oldRepository,
  )
  expect(staleRepositoryRecords).toHaveLength(0)
})

test('Open PR drawer uses Git Database API atomic commit path by default', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []
  const commitRequests: Array<Record<string, unknown>> = []
  const updateRefRequests: Array<Record<string, unknown>> = []
  const contentsPutRequests: string[] = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: { sha: 'branch-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/Develop/Open-Pr-Test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/branch-head-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'branch-head-sha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      commitRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      if (route.request().method() === 'PATCH') {
        updateRefRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/Develop/Open-Pr-Test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      if (route.request().method() === 'PUT') {
        contentsPutRequests.push(route.request().url())
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 52,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/52',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('Develop/Open-Pr-Test')
  await page.getByLabel('PR title').fill('Apply editor updates from develop')

  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/52',
  )

  expect(treeRequests).toHaveLength(1)
  expect((treeRequests[0]?.tree as Array<Record<string, unknown>>)?.length).toBe(2)
  expect(commitRequests).toHaveLength(1)
  expect(updateRefRequests).toHaveLength(1)
  expect(updateRefRequests[0]?.sha).toBe('new-commit-sha')
  expect(contentsPutRequests).toHaveLength(0)
})

test('Open PR drawer surfaces an error when Git Database commit fails', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []
  let pullRequestRequestCount = 0

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ object: { sha: 'branch-head-sha' } }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/Develop/Open-Pr-Test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/branch-head-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'branch-head-sha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Tree API unavailable' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      pullRequestRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 53,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/53',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('Develop/Open-Pr-Test')
  await page.getByLabel('PR title').fill('Apply editor updates from develop')

  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Open PR failed:')

  expect(treeRequests).toHaveLength(1)
  expect(pullRequestRequestCount).toBe(0)
})

test('Open PR drawer starts with empty title/description and short default head', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  const headValue = await page.getByLabel('Head').inputValue()
  expect(headValue).toMatch(/^feat\/component-[a-z0-9]{4}$/)
  await expect(page.getByLabel('PR title')).toHaveValue('')
  await expect(page.getByLabel('PR description')).toHaveValue('')
})

test('Open PR drawer base dropdown updates from mocked repo branches', async ({
  page,
}) => {
  const branchRequestUrls: string[] = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 2,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 1,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: 'knightedcodemonkey/css',
          default_branch: 'stable',
          permissions: { push: true },
        },
      ]),
    })
  })

  await page.route('https://api.github.com/repos/**/branches**', async route => {
    const url = route.request().url()
    branchRequestUrls.push(url)

    const branchNames = url.includes('/repos/knightedcodemonkey/css/branches')
      ? ['stable', 'release/1.x']
      : ['main', 'develop-next']

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(branchNames.map(name => ({ name }))),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'Loaded 2 writable repositories',
  )

  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.getByLabel('Pull request repository')
  const baseSelect = page.getByLabel('Pull request base branch')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await expect(baseSelect).toHaveValue('main')
  await expect(baseSelect.getByRole('option')).toHaveText(['main', 'develop-next'])

  await repoSelect.selectOption('knightedcodemonkey/css')
  await expect(baseSelect).toHaveValue('stable')
  await expect(baseSelect.getByRole('option')).toHaveText(['stable', 'release/1.x'])

  expect(
    branchRequestUrls.some(url =>
      url.includes('https://api.github.com/repos/knightedcodemonkey/develop/branches'),
    ),
  ).toBe(true)
  expect(
    branchRequestUrls.some(url =>
      url.includes('https://api.github.com/repos/knightedcodemonkey/css/branches'),
    ),
  ).toBe(true)
})

test('Open PR drawer does not persist active PR context in localStorage', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 2,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 1,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: 'knightedcodemonkey/css',
          default_branch: 'stable',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'develop-next'],
    'knightedcodemonkey/css': ['stable', 'release/1.x'],
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.getByLabel('Pull request repository')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await page.getByLabel('Head').fill('examples/develop/head')
  await page.getByLabel('Head').blur()

  await repoSelect.selectOption('knightedcodemonkey/css')
  await page.getByLabel('Head').fill('examples/css/head')
  await page.getByLabel('Head').blur()

  const legacyKeys = await page.evaluate(() => {
    const storagePrefix = 'knighted:develop:github-pr-config:'
    return Object.keys(localStorage).filter(key => key.startsWith(storagePrefix))
  })

  expect(legacyKeys).toHaveLength(0)
})

test('Open PR drawer never writes repo PR context keys in localStorage', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 2,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 1,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: 'knightedcodemonkey/css',
          default_branch: 'stable',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'develop-next'],
    'knightedcodemonkey/css': ['stable', 'release/1.x'],
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.getByLabel('Pull request repository')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await page.getByLabel('Head').fill('examples/develop/head')
  await page.getByLabel('Head').blur()

  await repoSelect.selectOption('knightedcodemonkey/css')

  const legacyKeys = await page.evaluate(() => {
    const storagePrefix = 'knighted:develop:github-pr-config:'
    return Object.keys(localStorage).filter(key => key.startsWith(storagePrefix))
  })

  expect(legacyKeys).toHaveLength(0)
})

test('Active PR context disconnect uses local-only confirmation flow', async ({
  page,
}) => {
  let closePullRequestRequestCount = 0

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      if (route.request().method() === 'PATCH') {
        closePullRequestRequestCount += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            number: 2,
            state: 'closed',
            title: 'Existing PR context from storage',
            html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
            head: { ref: 'develop/open-pr-test' },
            base: { ref: 'main' },
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await expect(
    page.getByRole('button', { name: 'Disconnect active pull request context' }),
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Disconnect active pull request context' })
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Disconnect PR context?')
  await expect(dialog).toContainText(
    'This will disconnect the active pull request context in this app only.',
  )
  await expect(dialog).toContainText('Your pull request will stay open on GitHub.')
  await expect(dialog).toContainText(
    'Your GitHub token and selected repository will stay connected.',
  )

  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  const recordAfterCancel = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/open-pr-test',
  })
  expect(recordAfterCancel?.prContextState).toBe('active')

  await page
    .getByRole('button', { name: 'Disconnect active pull request context' })
    .click()
  await dialog.getByRole('button', { name: 'Disconnect' }).click()

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Disconnect active pull request context' }),
  ).toBeHidden()

  const recordAfterDisconnect = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/open-pr-test',
  })
  expect(recordAfterDisconnect?.prContextState).toBe('disconnected')
  expect(recordAfterDisconnect?.prNumber).toBe(2)
  expect(closePullRequestRequestCount).toBe(0)
})

test('Active PR context updates controls and can be closed from AI controls', async ({
  page,
}) => {
  let closePullRequestRequestCount = 0

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      if (route.request().method() === 'PATCH') {
        closePullRequestRequestCount += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            number: 2,
            state: 'closed',
            title: 'Existing PR context from storage',
            html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
            head: { ref: 'develop/open-pr-test' },
            base: { ref: 'main' },
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Close active pull request context' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByText('PR: develop/pr/2')).toBeVisible()
  await dialog.getByRole('button', { name: 'Close PR on GitHub' }).click()

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()

  const recordAfterClose = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/open-pr-test',
  })
  expect(recordAfterClose?.prContextState).toBe('closed')
  expect(recordAfterClose?.prNumber).toBe(2)
  expect(closePullRequestRequestCount).toBe(1)
})

test('Active PR context is disabled on load when pull request is closed', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'closed',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Saved pull request context is not open on GitHub.')

  const recordAfterClosedVerify = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/open-pr-test',
  })
  expect(recordAfterClosedVerify?.prContextState).toBe('closed')
})

test('Active PR context rehydrates after token remove and re-add', async ({ page }) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: 'knightedcodemonkey/css',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
    'knightedcodemonkey/css': ['main', 'release', 'css/rehydrate-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/pulls/7',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 7,
          state: 'open',
          title: 'Saved css PR context',
          html_url: 'https://github.com/knightedcodemonkey/css/pull/7',
          head: { ref: 'css/rehydrate-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await page.evaluate(() => {
    localStorage.setItem('knighted:develop:github-repository', 'knightedcodemonkey/css')
  })

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/css',
    headBranch: 'css/rehydrate-test',
    prTitle: 'Saved css PR context',
    prNumber: 7,
    renderMode: 'react',
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await removeSavedGitHubToken(page)
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'GitHub token removed',
  )

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  const selectedRepository = await page.evaluate(() =>
    localStorage.getItem('knighted:develop:github-repository'),
  )
  expect(selectedRepository).toBe('knightedcodemonkey/css')
})

test('Active PR context deactivates after token remove and re-add when PR is closed', async ({
  page,
}) => {
  let useClosedPullRequest = false

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: 'knightedcodemonkey/css',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
    'knightedcodemonkey/css': ['main', 'release', 'css/rehydrate-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/pulls/7',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 7,
          state: useClosedPullRequest ? 'closed' : 'open',
          title: 'Saved css PR context',
          html_url: 'https://github.com/knightedcodemonkey/css/pull/7',
          head: { ref: 'css/rehydrate-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await page.evaluate(() => {
    localStorage.setItem('knighted:develop:github-repository', 'knightedcodemonkey/css')
  })

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/css',
    headBranch: 'css/rehydrate-test',
    prTitle: 'Saved css PR context',
    prNumber: 7,
    renderMode: 'react',
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await removeSavedGitHubToken(page)
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'GitHub token removed',
  )

  useClosedPullRequest = true
  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Open pull request', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Saved pull request context is not open on GitHub.')

  const closedRecord = await getWorkspaceTabsRecord(page, {
    headBranch: 'css/rehydrate-test',
  })
  expect(closedRecord?.prContextState).toBe('closed')
})

test('Active PR context recovers when saved head branch is missing but PR metadata exists', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Recovered PR context title',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: '',
    prTitle: 'Recovered PR context title',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByRole('button', { name: 'Push commit' }).last()).toBeVisible()
  await expect(page.getByLabel('Head')).toHaveValue('develop/open-pr-test')
})

test('Active PR context uses Push commit flow without creating a new pull request', async ({
  page,
}) => {
  const contentsPutRequests: string[] = []
  let createRefRequestCount = 0
  let pullRequestRequestCount = 0

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      createRefRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/unexpected' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      pullRequestRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 999,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/999',
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      if (route.request().method() === 'PUT') {
        contentsPutRequests.push(route.request().url())
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Tree API unavailable' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await ensureOpenPrDrawerOpen(page)

  await expect(page.getByLabel('Pull request repository')).toBeDisabled()
  await expect(page.getByLabel('Pull request base branch')).toBeDisabled()
  await expect(page.getByLabel('Head')).toHaveJSProperty('readOnly', true)
  await expect(page.getByLabel('PR title')).toHaveJSProperty('readOnly', true)
  await expect(page.getByLabel('Include entry tab')).toBeEnabled()
  await expect(page.getByLabel('Commit message')).toBeEditable()

  await expect(page.getByLabel('PR description')).toBeHidden()
  await expect(page.getByLabel('Commit message')).toBeVisible()

  const includeWrapperToggle = page.getByLabel('Include entry tab')
  await expect(includeWrapperToggle).toBeEnabled()
  await includeWrapperToggle.check()
  await expect(includeWrapperToggle).toBeChecked()
  await expect(page.getByRole('button', { name: 'Push commit' }).last()).toBeVisible()
  await expect(page.getByLabel('PR description')).toBeHidden()
  await expect(page.getByLabel('Commit message')).toBeVisible()

  await setComponentEditorSource(page, 'const commitMarker = 1')
  await setStylesEditorSource(page, '.commit-marker { color: red; }')
  const pushCommitMessage = 'chore: push active context sync'
  await page.getByLabel('Commit message').fill(pushCommitMessage)

  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    page.getByText('Push commit to active pull request branch?', { exact: true }),
  ).toHaveText('Push commit to active pull request branch?')
  await expect(
    page.getByText('Head branch: develop/open-pr-test', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Files to commit:', { exact: true })).toBeVisible()
  await expect(
    page.getByText('App.tsx -> src/components/App.tsx', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('app.css -> src/styles/app.css', { exact: true }),
  ).toBeVisible()

  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Push commit failed:')

  expect(createRefRequestCount).toBe(0)
  expect(pullRequestRequestCount).toBe(0)
  expect(contentsPutRequests).toHaveLength(0)
})

test('Active PR context push with no local changes shows neutral status', async ({
  page,
}) => {
  const updateRefRequests: Array<Record<string, unknown>> = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/existing-head-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'existing-head-sha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      if (route.request().method() === 'PATCH') {
        updateRefRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await ensureOpenPrDrawerOpen(page)

  await setComponentEditorSource(page, 'const commitMarker = 2')
  await ensureOpenPrDrawerOpen(page)

  await page.getByRole('button', { name: 'Push commit' }).last().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Commit pushed to develop/open-pr-test')
  expect(updateRefRequests).toHaveLength(1)

  await ensureOpenPrDrawerOpen(page)

  await page.getByRole('button', { name: 'Push commit' }).last().click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('No local editor changes to push.')
  await expect(page.locator('#clear-confirm-dialog')).toBeHidden()
})

test('New workspace tabs show Edited indicator in active PR context', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await addWorkspaceTab(page)

  await expect(
    page
      .getByRole('listitem', { name: 'Workspace tab module.tsx' })
      .locator('.workspace-tab__dirty-indicator'),
  ).toHaveCount(1)
})

test('Dirty tabs expose Edited in accessible names during active PR context', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await addWorkspaceTab(page)

  await expect(
    page.getByRole('button', { name: 'Open tab module.tsx (Edited)' }),
  ).toBeVisible()
  await expect(
    page.getByRole('listitem', { name: 'Workspace tab module.tsx (Edited)' }),
  ).toBeVisible()
})

test('Renaming a synced module tab marks it Edited and includes renamed path in Push commit confirmation', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/existing-head-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'existing-head-sha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'rename-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'rename-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'rename-commit-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  const now = Date.now()
  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName: 'knightedcodemonkey/develop',
        headBranch: 'develop/open-pr-test',
      }),
      repo: 'knightedcodemonkey/develop',
      base: 'main',
      head: 'develop/open-pr-test',
      prTitle: 'Existing PR context from storage',
      prNumber: 2,
      prContextState: 'active',
      renderMode: 'react',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Hello from Knighted</main>',
          targetPrFilePath: 'src/components/App.tsx',
          syncedContent: 'export const App = () => <main>Hello from Knighted</main>',
          syncedAt: now,
          isDirty: false,
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'main { color: #111; }',
          targetPrFilePath: 'src/styles/app.css',
          syncedContent: 'main { color: #111; }',
          syncedAt: now,
          isDirty: false,
        },
        {
          id: 'boop',
          name: 'boop.tsx',
          path: 'src/components/boop.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: 'export const Boop = () => <p>boop</p>',
          targetPrFilePath: 'src/components/boop.tsx',
          syncedContent: 'export const Boop = () => <p>boop</p>',
          syncedAt: now,
          isDirty: false,
        },
      ],
      activeTabId: 'component',
      createdAt: now,
      lastModified: now,
    },
  ])

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await renameWorkspaceTab(page, { from: 'boop.tsx', to: 'beep.tsx' })

  await expect(
    page.getByRole('button', { name: 'Open tab beep.tsx (Edited)' }),
  ).toBeVisible()

  await ensureOpenPrDrawerOpen(page)
  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByText('Files to commit:', { exact: true })).toBeVisible()
  await expect(
    page.getByText('beep.tsx -> src/components/beep.tsx', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('beep.tsx -> src/components/boop.tsx (delete)', { exact: true }),
  ).toBeVisible()

  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Commit pushed to develop/open-pr-test')

  expect(treeRequests).toHaveLength(1)
  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  const renamedBlob = treePayload?.find(file => file.path === 'src/components/beep.tsx')
  const deletedBlob = treePayload?.find(file => file.path === 'src/components/boop.tsx')

  expect(renamedBlob).toMatchObject({
    path: 'src/components/beep.tsx',
    mode: '100644',
    type: 'blob',
  })
  expect(typeof renamedBlob?.content).toBe('string')

  expect(deletedBlob).toEqual({
    path: 'src/components/boop.tsx',
    mode: '100644',
    type: 'blob',
    sha: null,
  })
})

test('Active PR context push commit uses Git Database API atomic path by default', async ({
  page,
}) => {
  let createRefRequestCount = 0
  let pullRequestRequestCount = 0
  const treeRequests: Array<Record<string, unknown>> = []
  const commitRequests: Array<Record<string, unknown>> = []
  const updateRefRequests: Array<Record<string, unknown>> = []
  const contentsPutRequests: string[] = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      createRefRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/unexpected' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      pullRequestRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 999,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/999',
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/existing-head-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'existing-head-sha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'push-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      commitRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'push-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      if (route.request().method() === 'PATCH') {
        updateRefRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-test' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      if (route.request().method() === 'PUT') {
        contentsPutRequests.push(route.request().url())
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await ensureOpenPrDrawerOpen(page)

  await setComponentEditorSource(page, 'const commitMarker = 2')
  await setStylesEditorSource(page, '.commit-marker { color: blue; }')
  const pushCommitMessage = 'chore: push active context sync (atomic)'
  await page.getByLabel('Commit message').fill(pushCommitMessage)

  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Commit pushed to develop/open-pr-test (develop/pr/2).')

  await expect
    .poll(
      async () => {
        const workspaceRecord = await getWorkspaceTabsRecord(page, {
          headBranch: 'develop/open-pr-test',
        })
        const tabs = Array.isArray(workspaceRecord?.tabs)
          ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
          : []
        const tabIds = new Set(
          tabs.map(tab => (typeof tab?.id === 'string' ? tab.id : '')).filter(Boolean),
        )
        const hasPrimaryTabs = tabIds.has('component') && tabIds.has('styles')
        return hasPrimaryTabs && tabs.every(tab => tab?.isDirty === false)
      },
      { timeout: 10_000 },
    )
    .toBe(true)

  await expect(
    page
      .getByRole('listitem', { name: 'Workspace tab App.tsx' })
      .locator('.workspace-tab__dirty-indicator'),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('listitem', { name: 'Workspace tab app.css' })
      .locator('.workspace-tab__dirty-indicator'),
  ).toHaveCount(0)
  await expect(page.locator('#component-dirty-status')).toBeHidden()
  await expect(page.locator('#styles-dirty-status')).toBeHidden()

  expect(createRefRequestCount).toBe(0)
  expect(pullRequestRequestCount).toBe(0)
  expect(treeRequests).toHaveLength(1)
  expect((treeRequests[0]?.tree as Array<Record<string, unknown>>)?.length).toBe(2)
  expect(commitRequests).toHaveLength(1)
  expect(commitRequests[0]?.message).toBe(pushCommitMessage)
  expect(updateRefRequests).toHaveLength(1)
  expect(updateRefRequests[0]?.sha).toBe('push-commit-sha')
  expect(contentsPutRequests).toHaveLength(0)
})

test('Open PR uses module tab paths when stale target file paths collide', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []
  const commitRequests: Array<Record<string, unknown>> = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123mainsha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/abc123mainsha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'abc123mainsha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'push-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      commitRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-stale-target-paths' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-stale-target-paths' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 333,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/333',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  const localBoopSource = 'export const Boop = () => <p>boop boop boop</p>\n'
  const localBeepSource = 'export const Beep = () => <p>beep beep beep</p>\n'
  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName: 'knightedcodemonkey/develop',
        headBranch: 'develop/open-pr-stale-target-paths',
      }),
      repo: 'knightedcodemonkey/develop',
      base: 'main',
      head: 'develop/open-pr-stale-target-paths',
      prTitle: 'Open PR with stale module target paths',
      prNumber: null,
      prContextState: 'inactive',
      renderMode: 'react',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content:
            "import '../styles/app.css'\nimport { Boop } from './boop.js'\nimport { Beep } from './beep.js'\n\nexport const App = () => (\n  <>\n    <Boop />\n    <Beep />\n  </>\n)\n",
          targetPrFilePath: 'src/components/App.tsx',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'p { margin: 0; color: blue; }\n',
          targetPrFilePath: 'src/styles/app.css',
        },
        {
          id: 'module-boop',
          name: 'boop.tsx',
          path: 'src/components/boop.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: localBoopSource,
          targetPrFilePath: 'src/components/App.tsx',
        },
        {
          id: 'module-beep',
          name: 'beep.tsx',
          path: 'src/components/beep.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: localBeepSource,
          targetPrFilePath: 'src/components/App.tsx',
        },
      ],
      activeTabId: 'component',
    },
  ])

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await ensureOpenPrDrawerOpen(page)

  const commitMessage = 'chore: open pr with stale module target path metadata'
  await page.getByLabel('Head').fill('develop/open-pr-stale-target-paths')
  await page.getByLabel('PR title').fill('Open PR keeps module paths and content')
  await page.getByLabel('Commit message').fill(commitMessage)
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/333',
  )

  expect(treeRequests).toHaveLength(1)
  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  expect(treePayload?.length).toBe(4)

  const componentBlob = treePayload?.find(file => file.path === 'src/components/App.tsx')
  const stylesBlob = treePayload?.find(file => file.path === 'src/styles/app.css')
  const boopBlob = treePayload?.find(file => file.path === 'src/components/boop.tsx')
  const beepBlob = treePayload?.find(file => file.path === 'src/components/beep.tsx')

  expect(componentBlob?.content).toEqual(expect.any(String))
  expect(stylesBlob?.content).toEqual(expect.any(String))
  expect(boopBlob?.content).toBe(localBoopSource)
  expect(beepBlob?.content).toBe(localBeepSource)

  expect(commitRequests).toHaveLength(1)
  expect(commitRequests[0]?.message).toBe(commitMessage)
})

test('Reloaded active PR context from URL metadata keeps Push mode and status reference', async ({
  page,
}) => {
  const contentsPutRequests: string[] = []
  let createRefRequestCount = 0
  let pullRequestRequestCount = 0

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'existing-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      createRefRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/unexpected-branch' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      pullRequestRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 999,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/999',
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      if (route.request().method() === 'PUT') {
        contentsPutRequests.push(route.request().url())
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Tree API unavailable' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByRole('button', { name: 'Push commit' }).last()).toBeVisible()
  await expect(page.getByLabel('Head')).toHaveValue('develop/open-pr-test')
  await expect(page.getByLabel('PR description')).toBeHidden()
  await expect(page.getByLabel('Commit message')).toBeVisible()

  await setComponentEditorSource(page, 'const commitMarker = 1')
  await setStylesEditorSource(page, '.commit-marker { color: red; }')

  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Push commit failed:')

  expect(createRefRequestCount).toBe(0)
  expect(pullRequestRequestCount).toBe(0)
  expect(contentsPutRequests).toHaveLength(0)
})

test('Reload keeps persisted active PR workspace context active', async ({ page }) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const headBranch = 'develop/open-pr-test'

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release', headBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: headBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName,
    headBranch,
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  const workspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch,
  })

  await page.evaluate(
    ({ repo }) => {
      localStorage.setItem(
        'knighted:develop:github-pat',
        'github_pat_fake_chat_1234567890',
      )
      localStorage.setItem('knighted:develop:github-repository', repo)
    },
    { repo: repositoryFullName },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  const activeRecord = await getWorkspaceTabsRecord(page, { headBranch })
  expect(activeRecord?.id).toBe(workspaceId)
  expect(activeRecord?.prContextState).toBe('active')
  expect(activeRecord?.prNumber).toBe(2)

  const workspaceRecords = await getAllWorkspaceRecords(page)
  const activeRecordsForPr = workspaceRecords.filter(
    record =>
      record?.repo === repositoryFullName &&
      record?.prContextState === 'active' &&
      record?.prNumber === 2,
  )
  expect(activeRecordsForPr).toHaveLength(1)
})

test('Reload prefers active PR workspace when mixed workspace records exist', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const activeHeadBranch = 'develop/open-pr-test'
  const inactiveHeadBranch = 'feat/stale-local-workspace'

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release', activeHeadBranch, inactiveHeadBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: activeHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  const activeWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: activeHeadBranch,
  })
  const inactiveWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: inactiveHeadBranch,
  })

  await seedLocalWorkspaceContexts(page, [
    {
      id: inactiveWorkspaceId,
      repo: repositoryFullName,
      base: 'main',
      head: inactiveHeadBranch,
      prTitle: '',
      prNumber: null,
      prContextState: 'inactive',
      renderMode: 'dom',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Inactive workspace</main>',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'main { color: #444; }',
        },
      ],
      activeTabId: 'component',
    },
    {
      id: activeWorkspaceId,
      repo: repositoryFullName,
      base: 'main',
      head: activeHeadBranch,
      prTitle: 'Existing PR context from storage',
      prNumber: 2,
      prContextState: 'active',
      renderMode: 'react',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Active workspace</main>',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'main { color: tomato; }',
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page.evaluate(
    ({ repo }) => {
      localStorage.setItem(
        'knighted:develop:github-pat',
        'github_pat_fake_chat_1234567890',
      )
      localStorage.setItem('knighted:develop:github-repository', repo)
    },
    { repo: repositoryFullName },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  const selectedRecord = await getWorkspaceTabsRecord(page, {
    headBranch: activeHeadBranch,
  })
  expect(selectedRecord?.id).toBe(activeWorkspaceId)
  expect(selectedRecord?.prContextState).toBe('active')
  expect(selectedRecord?.prNumber).toBe(2)
})

test('Reloaded active PR context syncs editor content from GitHub branch and restores style mode', async ({
  page,
}) => {
  const remoteComponentSource = 'export const App = () => <main>Synced from PR</main>'
  const remoteStylesSource = '.synced-from-pr { color: tomato; }'

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      const request = route.request()
      const method = request.method()
      const url = new URL(request.url())
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '')
      const ref = url.searchParams.get('ref')

      if (method !== 'GET' || ref !== 'develop/open-pr-test') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      if (path === 'src/components/App.tsx') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sha: 'component-sha',
            content: Buffer.from(remoteComponentSource, 'utf8').toString('base64'),
          }),
        })
        return
      }

      if (path === 'src/styles/app.css') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sha: 'styles-sha',
            content: Buffer.from(remoteStylesSource, 'utf8').toString('base64'),
          }),
        })
        return
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
    styleLanguage: 'sass',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await expect(page.getByLabel('Render mode')).toHaveValue('react')
  await expect(page.getByLabel('Style mode')).toHaveValue('sass')

  await expect
    .poll(async () => {
      const result = await page.evaluate(() => {
        const componentEditor = document.getElementById('jsx-editor')
        const stylesEditor = document.getElementById('css-editor')

        return {
          component:
            componentEditor instanceof HTMLTextAreaElement ? componentEditor.value : '',
          styles: stylesEditor instanceof HTMLTextAreaElement ? stylesEditor.value : '',
        }
      })

      const componentMatchesKnownStates =
        result.component === remoteComponentSource ||
        result.component === 'export const App = () => <main>Hello from Knighted</main>'

      return componentMatchesKnownStates && result.styles === remoteStylesSource
    })
    .toBe(true)
})

test('Reloaded active PR context sync does not overwrite non-primary module tabs', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const headBranch = 'develop/open-pr-test'
  const remoteComponentSource = 'export const App = () => <main>Synced App</main>'
  const remoteStylesSource = '.synced-app-styles { color: cyan; }'
  const localBoopSource = 'export const Boop = () => <p>Boop local module</p>\n'
  const localBeepSource = 'export const Beep = () => <p>Beep local module</p>\n'

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release', headBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: headBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      const request = route.request()
      const method = request.method()
      const url = new URL(request.url())
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '')
      const ref = url.searchParams.get('ref')

      if (method !== 'GET' || ref !== headBranch) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      if (path === 'src/components/App.tsx') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sha: 'component-sha',
            content: Buffer.from(remoteComponentSource, 'utf8').toString('base64'),
          }),
        })
        return
      }

      if (path === 'src/styles/app.css') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sha: 'styles-sha',
            content: Buffer.from(remoteStylesSource, 'utf8').toString('base64'),
          }),
        })
        return
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch,
      }),
      repo: repositoryFullName,
      base: 'main',
      head: headBranch,
      prTitle: 'Existing PR context from storage',
      prNumber: 2,
      prContextState: 'active',
      renderMode: 'react',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Local App</main>\n',
          targetPrFilePath: 'src/components/App.tsx',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: '.local-app-styles { color: magenta; }\n',
          targetPrFilePath: 'src/styles/app.css',
        },
        {
          id: 'module-boop',
          name: 'boop.tsx',
          path: 'src/components/boop.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: localBoopSource,
          targetPrFilePath: 'src/components/boop.tsx',
        },
        {
          id: 'module-beep',
          name: 'beep.tsx',
          path: 'src/components/beep.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: localBeepSource,
          targetPrFilePath: 'src/components/beep.tsx',
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page.evaluate(repo => {
    localStorage.setItem('knighted:develop:github-pat', 'github_pat_fake_chat_1234567890')
    localStorage.setItem('knighted:develop:github-repository', repo)
  }, repositoryFullName)

  await waitForAppReady(page, `${appEntryPath}`)

  await expect
    .poll(
      async () => {
        const workspaceRecord = await getWorkspaceTabsRecord(page, { headBranch })
        const tabs = Array.isArray(workspaceRecord?.tabs)
          ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
          : []

        const entryTab = tabs.find(tab => tab?.id === 'component')
        const boopTab = tabs.find(tab => tab?.id === 'module-boop')
        const beepTab = tabs.find(tab => tab?.id === 'module-beep')

        return {
          entryContent: typeof entryTab?.content === 'string' ? entryTab.content : '',
          entryTargetPath:
            typeof entryTab?.targetPrFilePath === 'string'
              ? entryTab.targetPrFilePath
              : '',
          boopContent: typeof boopTab?.content === 'string' ? boopTab.content : '',
          boopTargetPath:
            typeof boopTab?.targetPrFilePath === 'string' ? boopTab.targetPrFilePath : '',
          beepContent: typeof beepTab?.content === 'string' ? beepTab.content : '',
          beepTargetPath:
            typeof beepTab?.targetPrFilePath === 'string' ? beepTab.targetPrFilePath : '',
        }
      },
      { timeout: 10_000 },
    )
    .toEqual({
      entryContent: remoteComponentSource,
      entryTargetPath: 'src/components/App.tsx',
      boopContent: localBoopSource,
      boopTargetPath: 'src/components/boop.tsx',
      beepContent: localBeepSource,
      beepTargetPath: 'src/components/beep.tsx',
    })
})

test('Reloaded active PR context sync does not overwrite non-primary tabs with stale target path collisions', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const headBranch = 'develop/open-pr-test'
  const remoteComponentSource = 'export const App = () => <main>Synced App</main>'
  const remoteStylesSource = '.synced-app-styles { color: cyan; }'
  const localBoopSource = 'export const Boop = () => <p>Boop local module</p>\n'
  const localBeepSource = 'export const Beep = () => <p>Beep local module</p>\n'

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release', headBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: headBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      const request = route.request()
      const method = request.method()
      const url = new URL(request.url())
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '')
      const ref = url.searchParams.get('ref')

      if (method !== 'GET' || ref !== headBranch) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      if (path === 'src/components/App.tsx') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sha: 'component-sha',
            content: Buffer.from(remoteComponentSource, 'utf8').toString('base64'),
          }),
        })
        return
      }

      if (path === 'src/styles/app.css') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sha: 'styles-sha',
            content: Buffer.from(remoteStylesSource, 'utf8').toString('base64'),
          }),
        })
        return
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch,
      }),
      repo: repositoryFullName,
      base: 'main',
      head: headBranch,
      prTitle: 'Existing PR context from storage',
      prNumber: 2,
      prContextState: 'active',
      renderMode: 'react',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Local App</main>\n',
          targetPrFilePath: 'src/components/App.tsx',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: '.local-app-styles { color: magenta; }\n',
          targetPrFilePath: 'src/styles/app.css',
        },
        {
          id: 'module-boop',
          name: 'boop.tsx',
          path: 'src/components/boop.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: localBoopSource,
          targetPrFilePath: 'src/components/App.tsx',
        },
        {
          id: 'module-beep',
          name: 'beep.tsx',
          path: 'src/components/beep.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: localBeepSource,
          targetPrFilePath: 'src/components/App.tsx',
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page.evaluate(repo => {
    localStorage.setItem('knighted:develop:github-pat', 'github_pat_fake_chat_1234567890')
    localStorage.setItem('knighted:develop:github-repository', repo)
  }, repositoryFullName)

  await waitForAppReady(page, `${appEntryPath}`)

  await expect
    .poll(
      async () => {
        const workspaceRecord = await getWorkspaceTabsRecord(page, { headBranch })
        const tabs = Array.isArray(workspaceRecord?.tabs)
          ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
          : []

        const entryTab = tabs.find(tab => tab?.id === 'component')
        const boopTab = tabs.find(tab => tab?.id === 'module-boop')
        const beepTab = tabs.find(tab => tab?.id === 'module-beep')

        return {
          entryContent: typeof entryTab?.content === 'string' ? entryTab.content : '',
          boopContent: typeof boopTab?.content === 'string' ? boopTab.content : '',
          beepContent: typeof beepTab?.content === 'string' ? beepTab.content : '',
        }
      },
      { timeout: 10_000 },
    )
    .toEqual({
      entryContent: remoteComponentSource,
      boopContent: localBoopSource,
      beepContent: localBeepSource,
    })
})

test('Reloaded active PR context falls back to css style mode for unsupported value', async ({
  page,
}) => {
  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release', 'develop/open-pr-test'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Existing PR context from storage',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: 'develop/open-pr-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName: 'knightedcodemonkey/develop',
    headBranch: 'develop/open-pr-test',
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
    styleLanguage: 'css',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await expect(page.getByLabel('Render mode')).toHaveValue('react')
  await expect(page.getByLabel('Style mode')).toHaveValue('css')
})

test('Open PR drawer shows confirmation with tab-derived files', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('PR title').fill('Tab-derived summary prompt')
  const dialog = await triggerOpenPrConfirmation(page)
  await expect(dialog.getByText('Files to commit:', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('Open PR drawer confirmation does not report path traversal errors', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('PR title').fill('No traversal error in default flow')

  await expectOpenPrConfirmationPrompt(page)
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).not.toContainText('File path cannot include parent directory traversal.')
})

test('Open PR drawer include entry tab checkbox defaults on and resets on reopen', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  const includeWrapperToggle = page.getByLabel('Include entry tab')
  await expect(includeWrapperToggle).toBeChecked()

  await includeWrapperToggle.uncheck()
  await expect(includeWrapperToggle).not.toBeChecked()

  await page.getByRole('button', { name: 'Close open pull request drawer' }).click()
  await ensureOpenPrDrawerOpen(page)

  await expect(includeWrapperToggle).toBeChecked()
})

test('Open PR drawer includes App wrapper in committed component source by default', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123mainsha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/abc123mainsha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'abc123mainsha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-app-wrapper' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-app-wrapper' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 101,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/101',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)

  const componentSource = [
    'const CounterButton = () => <button type="button">Counter</button>',
    'const App = () => <CounterButton />',
  ].join('\n')

  await setComponentEditorSource(page, componentSource)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('develop/repo/editor-sync-without-app')
  await page.getByLabel('PR title').fill('Include App wrapper by default')
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/101',
  )

  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  const componentBlob = treePayload?.find(file => file.path === 'src/components/App.tsx')
  expect(componentBlob?.content).toEqual(expect.any(String))
  const fullComponentSource = String(componentBlob?.content)

  expect(fullComponentSource).toContain('const CounterButton = () =>')
  expect(fullComponentSource).toContain('const App = () =>')
})

test('Open PR drawer strips App wrapper from committed source when toggled off', async ({
  page,
}) => {
  const treeRequests: Array<Record<string, unknown>> = []

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: 'knightedcodemonkey/develop',
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123mainsha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/abc123mainsha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'abc123mainsha',
          tree: { sha: 'base-tree-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-app-wrapper' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/develop/open-pr-app-wrapper' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 101,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/101',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)

  await setComponentEditorSource(
    page,
    [
      'const CounterButton = () => <button type="button">Counter</button>',
      'const App = () => <CounterButton />',
    ].join('\n'),
  )
  await ensureOpenPrDrawerOpen(page)

  const includeWrapperToggle = page.getByLabel('Include entry tab')
  await includeWrapperToggle.uncheck()

  await page.getByLabel('Head').fill('develop/repo/editor-sync-with-app')
  await page.getByLabel('PR title').fill('Strip App wrapper in commit')
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/101',
  )

  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  const componentBlob = treePayload?.find(file => file.path === 'src/components/App.tsx')
  expect(componentBlob?.content).toEqual(expect.any(String))
  const strippedComponentSource = String(componentBlob?.content)
  expect(strippedComponentSource).toContain('const CounterButton = () =>')
  expect(strippedComponentSource).not.toContain('const App = () =>')
})
