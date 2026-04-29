import { expect, test } from '@playwright/test'
import {
  addWorkspaceTab,
  appEntryPath,
  buildWorkspaceRecordId,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  getAllWorkspaceRecords,
  getWorkspaceComponentContent,
  getWorkspaceTabsRecord,
  mockRepositoryBranches,
  openMostRecentStoredWorkspaceContext,
  renameWorkspaceTab,
  seedActivePrWorkspaceContext,
  seedLocalWorkspaceContexts,
  selectWorkspacesRepositoryFilter,
  setComponentEditorSource,
  setStylesEditorSource,
  submitOpenPrAndConfirm,
  waitForAppReady,
} from './github-pr-drawer.helpers.js'

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
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      const url = new URL(route.request().url())
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '').trim()
      const responseByPath: Record<string, { status: number; body: string }> = {
        'src/components/boop.tsx': {
          status: 200,
          body: JSON.stringify({ sha: 'boop-existing-sha' }),
        },
      }
      const response = responseByPath[path] ?? {
        status: 404,
        body: JSON.stringify({ message: 'Not Found' }),
      }

      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: response.body,
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
  const pushCommitButton = page
    .locator('#github-pr-drawer')
    .getByRole('button', { name: 'Push commit', exact: true })
  await expect(pushCommitButton).toBeEnabled()
  await pushCommitButton.evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Files to commit:', { exact: true })).toBeVisible()
  await expect(
    dialog.getByText('beep.tsx -> src/components/beep.tsx', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText('beep.tsx -> src/components/boop.tsx (delete)', { exact: true }),
  ).toBeVisible()

  await dialog.locator('button[value="confirm"]').evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

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

test('Push commit prunes stale delete entries before Git tree creation', async ({
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
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      treeRequests.push(payload)

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
          name: 'style.css',
          path: 'src/style.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'button {\n  color: red;\n}',
          targetPrFilePath: 'src/styles.css',
          syncedContent: 'button {\n  color: red;\n}',
          syncedAt: now,
          isDirty: true,
        },
      ],
      activeTabId: 'component',
      createdAt: now,
      lastModified: now,
    },
  ])

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await ensureOpenPrDrawerOpen(page)
  const pushCommitButton = page
    .locator('#github-pr-drawer')
    .getByRole('button', { name: 'Push commit', exact: true })
  await expect(pushCommitButton).toBeEnabled()
  await pushCommitButton.evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('button[value="confirm"]').evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Commit pushed to develop/open-pr-test')

  expect(treeRequests).toHaveLength(1)

  const firstTreeEntries = treeRequests[0]?.tree as Array<Record<string, unknown>>
  expect(Array.isArray(firstTreeEntries)).toBe(true)

  expect(
    firstTreeEntries.some(
      entry => entry?.path === 'src/styles.css' && entry?.sha === null,
    ),
  ).toBe(false)
  expect(firstTreeEntries.some(entry => entry?.path === 'src/style.css')).toBe(true)
})

test('Active PR context sync applies remote updates by tab path', async ({ page }) => {
  const remoteByPath: Record<string, string> = {
    'src/components/widget.tsx': 'export const Widget = () => <main>Synced widget</main>',
    'src/styles/app.css': '.widget { color: green; }',
  }

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
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      const url = new URL(route.request().url())
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '').trim()
      const content = remoteByPath[path]

      if (!content) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          path,
          sha: `sha-${path.replace(/[^a-z0-9]/gi, '-')}`,
          content: Buffer.from(content, 'utf8').toString('base64'),
          encoding: 'base64',
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
          isActive: false,
          content: 'export const App = () => <main>Local entry</main>',
          targetPrFilePath: 'src/components/App.tsx',
          syncedContent: 'export const App = () => <main>Local entry</main>',
          syncedAt: now,
          isDirty: false,
        },
        {
          id: 'workspace-styles',
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
          id: 'widget-tab',
          name: 'widget.tsx',
          path: 'src/components/widget.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: true,
          content: 'export const Widget = () => <main>Local widget</main>',
          targetPrFilePath: 'src/components/widget.tsx',
          syncedContent: 'export const Widget = () => <main>Local widget</main>',
          syncedAt: now,
          isDirty: false,
        },
      ],
      activeTabId: 'widget-tab',
      createdAt: now,
      lastModified: now,
    },
  ])

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)

  await expect
    .poll(async () => {
      const workspaceRecord = await getWorkspaceTabsRecord(page, {
        headBranch: 'develop/open-pr-test',
      })
      const tabs = Array.isArray(workspaceRecord?.tabs)
        ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
        : []

      const entryTab = tabs.find(
        tab =>
          typeof tab?.path === 'string' && tab.path.trim() === 'src/components/App.tsx',
      )
      const stylesTab = tabs.find(
        tab => typeof tab?.path === 'string' && tab.path.trim() === 'src/styles/app.css',
      )
      const widgetTab = tabs.find(
        tab =>
          typeof tab?.path === 'string' &&
          tab.path.trim() === 'src/components/widget.tsx',
      )

      return {
        entryContent:
          typeof entryTab?.content === 'string' ? entryTab.content.trim() : '',
        widgetContent:
          typeof widgetTab?.content === 'string' ? widgetTab.content.trim() : '',
        widgetSynced:
          typeof widgetTab?.syncedContent === 'string'
            ? widgetTab.syncedContent.trim()
            : '',
        stylesContent:
          typeof stylesTab?.content === 'string' ? stylesTab.content.trim() : '',
      }
    })
    .toEqual({
      entryContent: 'export const App = () => <main>Local entry</main>',
      widgetContent: remoteByPath['src/components/widget.tsx'],
      widgetSynced: remoteByPath['src/components/widget.tsx'],
      stylesContent: remoteByPath['src/styles/app.css'],
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
  browserName,
}) => {
  // WebKit-only quarantine: keep this spec active on Chromium while CI flake is investigated.
  test.fixme(
    browserName === 'webkit',
    'Temporarily quarantined on WebKit due CI-only Workspaces drawer timing flake.',
  )

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

test('Non-local New workspace forks from active PR context into a new repository workspace', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const activeHeadBranch = 'develop/open-pr-test'

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
    [repositoryFullName]: ['main', 'release', activeHeadBranch],
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

  await seedActivePrWorkspaceContext(page, {
    repositoryFullName,
    headBranch: activeHeadBranch,
    prTitle: 'Existing PR context from storage',
    prNumber: 2,
    renderMode: 'react',
  })

  await connectByotWithSingleRepo(page)
  await openMostRecentStoredWorkspaceContext(page)
  await ensureOpenPrDrawerOpen(page)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await selectWorkspacesRepositoryFilter(page, repositoryFullName)

  const countRepositoryRecords = async () => {
    const records = await getAllWorkspaceRecords(page)
    return records.filter(record => {
      const repo = typeof record?.repo === 'string' ? record.repo.trim() : ''
      return repo === repositoryFullName
    }).length
  }

  const initialRepositoryCount = await countRepositoryRecords()
  await page.getByRole('button', { name: 'New workspace', exact: true }).click()

  await expect.poll(async () => countRepositoryRecords()).toBe(initialRepositoryCount + 1)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Push commit' })).toHaveCount(0)
})

test('Reload restores active PR context when title is empty but PR identity exists', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const headBranch = 'develop/open-pr-empty-title'

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
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/37',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 37,
          state: 'open',
          title: 'Recovered PR title from GitHub',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/37',
          head: { ref: headBranch },
          base: { ref: 'main' },
        }),
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
      prTitle: '',
      prNumber: 37,
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
          content: 'export const App = () => <main>Active identity restore</main>',
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

  await expect
    .poll(async () => {
      const record = await getWorkspaceTabsRecord(page, {
        headBranch,
      })

      return {
        prContextState:
          typeof record?.prContextState === 'string' ? record.prContextState : null,
        prNumber:
          typeof record?.prNumber === 'number' && Number.isFinite(record.prNumber)
            ? record.prNumber
            : null,
      }
    })
    .toEqual({
      prContextState: 'active',
      prNumber: 37,
    })
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

      const workspaceRecord = await getWorkspaceTabsRecord(page, {
        headBranch: 'develop/open-pr-test',
      })
      const tabs = Array.isArray(workspaceRecord?.tabs)
        ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
        : []
      const stylesTab = tabs.find(
        tab => typeof tab?.path === 'string' && tab.path.trim() === 'src/styles/app.css',
      )
      const stylesContent =
        typeof stylesTab?.content === 'string' ? stylesTab.content : ''

      const componentMatchesKnownStates =
        result.component === remoteComponentSource ||
        result.component === 'export const App = () => <main>Hello from Knighted</main>'

      return (
        componentMatchesKnownStates &&
        (result.styles === remoteStylesSource || stylesContent === remoteStylesSource)
      )
    })
    .toBe(true)
})

test('Reloaded active PR context does not apply partial sync when one primary file is missing', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const headBranch = 'develop/open-pr-test'
  const localComponentSource = 'export const App = () => <main>Local App</main>\n'
  const localStylesSource = '.local-app-styles { color: magenta; }\n'
  const remoteComponentSource = 'export const App = () => <main>Remote App</main>\n'

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

      /* Intentionally missing styles file forces a partial sync candidate. */
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
          content: localComponentSource,
          targetPrFilePath: 'src/components/App.tsx',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: localStylesSource,
          targetPrFilePath: 'src/styles/app.css',
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
        const stylesTab = tabs.find(tab => tab?.id === 'styles')

        return {
          entryContent: typeof entryTab?.content === 'string' ? entryTab.content : '',
          stylesContent: typeof stylesTab?.content === 'string' ? stylesTab.content : '',
        }
      },
      { timeout: 10_000 },
    )
    .toEqual({
      entryContent: localComponentSource,
      stylesContent: localStylesSource,
    })
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
    .toMatchObject({
      entryTargetPath: 'src/components/App.tsx',
      boopContent: localBoopSource,
      boopTargetPath: 'src/components/boop.tsx',
      beepContent: localBeepSource,
      beepTargetPath: 'src/components/beep.tsx',
    })

  const workspaceAfterSync = await getWorkspaceTabsRecord(page, { headBranch })
  const entryAfterSyncContent = getWorkspaceComponentContent(workspaceAfterSync)
  expect(
    new Set([
      remoteComponentSource,
      'export const App = () => <main>Local App</main>\n',
    ]).has(entryAfterSyncContent),
  ).toBe(true)
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
    .toMatchObject({
      boopContent: localBoopSource,
      beepContent: localBeepSource,
    })

  const staleCollisionRecord = await getWorkspaceTabsRecord(page, { headBranch })
  const staleCollisionEntryContent = getWorkspaceComponentContent(staleCollisionRecord)
  expect(
    new Set([
      remoteComponentSource,
      'export const App = () => <main>Local App</main>\n',
    ]).has(staleCollisionEntryContent),
  ).toBe(true)
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
