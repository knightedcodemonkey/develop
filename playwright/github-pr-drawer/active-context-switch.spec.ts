import { expect, test } from '@playwright/test'
import {
  appEntryPath,
  buildWorkspaceRecordId,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  getAllWorkspaceRecords,
  getWorkspaceTabsRecord,
  mockRepositoryBranches,
  openMostRecentStoredWorkspaceContext,
  openStoredWorkspaceContextByHead,
  openStoredWorkspaceContextById,
  removeSavedGitHubToken,
  runActiveWorkspaceCrossRepoSwitchIntegrityScenario,
  runActiveWorkspaceSwitchIntegrityScenario,
  seedActivePrWorkspaceContext,
  seedLocalWorkspaceContexts,
  setComponentEditorSource,
  setStylesEditorSource,
  toRecordIntegritySnapshot,
  waitForAppReady,
} from './github-pr-drawer.helpers.js'

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
  await expect(
    page.getByRole('listitem', { name: 'Workspace tab App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Workspace editor tabs' }).getByRole('listitem'),
  ).toHaveCount(1)
  await expect(page.locator('#preview-host iframe')).toHaveCount(0)

  const recordAfterDisconnect = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/open-pr-test',
  })
  expect(recordAfterDisconnect?.prContextState).toBe('disconnected')
  expect(recordAfterDisconnect?.prNumber).toBe(2)
  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      return records.filter(
        record =>
          record?.repo === 'knightedcodemonkey/develop' &&
          record?.prContextState === 'active' &&
          record?.prNumber === 2,
      ).length
    })
    .toBe(0)
  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const localRecord = records.find(
        record =>
          typeof record?.id === 'string' &&
          record.id.startsWith('ws_') &&
          record?.prContextState === 'inactive',
      )
      return Boolean(localRecord)
    })
    .toBe(true)
  expect(closePullRequestRequestCount).toBe(0)

  await waitForAppReady(page, `${appEntryPath}`)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Disconnect active pull request context' }),
  ).toBeHidden()

  const recordAfterReload = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/open-pr-test',
  })
  expect(recordAfterReload?.prContextState).toBe('disconnected')
  expect(recordAfterReload?.prNumber).toBe(2)
})

test('Reopening a disconnected workspace from Workspaces restores active PR controls and editor state', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const activeHeadBranch = 'develop/open-pr-test'
  const inactiveHeadBranch = 'feat/fallback-workspace'
  const activeWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: activeHeadBranch,
  })
  const inactiveWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: inactiveHeadBranch,
  })

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

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: `refs/heads/${activeHeadBranch}`,
          object: { type: 'commit', sha: 'existing-head-sha' },
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
          content: 'export const App = () => <main>Fallback workspace view</main>',
        },
        {
          id: 'styles',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'main { color: #333; }',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 120_000,
      lastModified: Date.now() - 120_000,
    },
  ])

  await connectByotWithSingleRepo(page)
  await openStoredWorkspaceContextById(page, activeWorkspaceId)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Disconnect active pull request context' })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  const disconnectedRecord = await getWorkspaceTabsRecord(page, {
    headBranch: activeHeadBranch,
  })
  expect(disconnectedRecord?.prContextState).toBe('disconnected')

  await openStoredWorkspaceContextById(page, inactiveWorkspaceId)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Fallback workspace view')

  await openStoredWorkspaceContextById(page, activeWorkspaceId)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Disconnect active pull request context' }),
  ).toBeVisible()
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Hello from Knighted')

  const reactivatedRecord = await getWorkspaceTabsRecord(page, {
    headBranch: activeHeadBranch,
  })
  expect(reactivatedRecord?.prContextState).toBe('active')
  expect(reactivatedRecord?.prNumber).toBe(2)
})

test('Switching active workspace to inactive preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceSwitchIntegrityScenario({
    page,
    targetState: 'inactive',
  })
  await expect(page.getByRole('status', { name: 'App status' })).toContainText('Rendered')
})

test('Switching active workspace to disconnected preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceSwitchIntegrityScenario({
    page,
    targetState: 'disconnected',
  })
  await expect(page.getByRole('status', { name: 'App status' })).toContainText('Rendered')
})

test('Switching active workspace to closed preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceSwitchIntegrityScenario({
    page,
    targetState: 'closed',
  })
  await expect(page.getByRole('status', { name: 'App status' })).toContainText('Rendered')
})

test('Switching active workspace to cross-repo inactive preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceCrossRepoSwitchIntegrityScenario({
    page,
    targetState: 'inactive',
  })
  await expect(page.getByRole('status', { name: 'App status' })).toContainText('Rendered')
})

test('Switching active workspace to cross-repo disconnected preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceCrossRepoSwitchIntegrityScenario({
    page,
    targetState: 'disconnected',
  })
  await expect(page.getByRole('status', { name: 'App status' })).toContainText('Rendered')
})

test('Switching from one active context in source repo to target repo does not overwrite sibling active source context', async ({
  page,
}) => {
  const sourceRepositoryFullName = 'knightedcodemonkey/css'
  const targetRepositoryFullName = 'knightedcodemonkey/develop'
  const sourceHeadBranchPrimary = 'css/issue-123-primary'
  const sourceHeadBranchSibling = 'css/issue-123-sibling'
  const targetHeadBranch = 'develop/issue-123-target'

  const sourcePrimaryWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: sourceRepositoryFullName,
    headBranch: sourceHeadBranchPrimary,
  })
  const sourceSiblingWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: sourceRepositoryFullName,
    headBranch: sourceHeadBranchSibling,
  })
  const targetWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: targetRepositoryFullName,
    headBranch: targetHeadBranch,
  })

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: sourceRepositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: targetRepositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [sourceRepositoryFullName]: [
      'main',
      sourceHeadBranchPrimary,
      sourceHeadBranchSibling,
    ],
    [targetRepositoryFullName]: ['main', targetHeadBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/pulls/9',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 9,
          state: 'open',
          title: 'Source primary active workspace',
          html_url: 'https://github.com/knightedcodemonkey/css/pull/9',
          head: { ref: sourceHeadBranchPrimary },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/pulls/10',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 10,
          state: 'open',
          title: 'Source sibling active workspace',
          html_url: 'https://github.com/knightedcodemonkey/css/pull/10',
          head: { ref: sourceHeadBranchSibling },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/2',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 2,
          state: 'open',
          title: 'Target active workspace',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: targetHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: `refs/heads/${sourceHeadBranchPrimary}`,
          object: { type: 'commit', sha: 'source-primary-sha' },
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
          ref: `refs/heads/${targetHeadBranch}`,
          object: { type: 'commit', sha: 'target-head-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: sourcePrimaryWorkspaceId,
      repo: sourceRepositoryFullName,
      base: 'main',
      head: sourceHeadBranchPrimary,
      prTitle: 'Source primary active workspace',
      prNumber: 9,
      prContextState: 'active',
      renderMode: 'dom',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Source primary content</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 180_000,
      lastModified: Date.now() - 180_000,
    },
    {
      id: sourceSiblingWorkspaceId,
      repo: sourceRepositoryFullName,
      base: 'main',
      head: sourceHeadBranchSibling,
      prTitle: 'Source sibling active workspace',
      prNumber: 10,
      prContextState: 'active',
      renderMode: 'dom',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: 'export const App = () => <main>Source sibling content</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 120_000,
      lastModified: Date.now() - 120_000,
    },
    {
      id: targetWorkspaceId,
      repo: targetRepositoryFullName,
      base: 'main',
      head: targetHeadBranch,
      prTitle: 'Target active workspace',
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
          content: 'export const App = () => <main>Target content</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 60_000,
      lastModified: Date.now() - 60_000,
    },
  ])

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await openStoredWorkspaceContextByHead(page, sourceHeadBranchPrimary)
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await openStoredWorkspaceContextByHead(page, targetHeadBranch)
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Target content')

  await expect
    .poll(async () => {
      const sourcePrimaryRecord = await getWorkspaceTabsRecord(page, {
        headBranch: sourceHeadBranchPrimary,
      })
      return toRecordIntegritySnapshot(
        sourcePrimaryRecord as Record<string, unknown> | null,
      )
    })
    .toEqual({
      repo: sourceRepositoryFullName,
      base: 'main',
      head: sourceHeadBranchPrimary,
      prTitle: 'Source primary active workspace',
      prNumber: 9,
      prContextState: 'active',
      componentContent: 'export const App = () => <main>Source primary content</main>',
    })

  await expect
    .poll(async () => {
      const sourceSiblingRecord = await getWorkspaceTabsRecord(page, {
        headBranch: sourceHeadBranchSibling,
      })
      return toRecordIntegritySnapshot(
        sourceSiblingRecord as Record<string, unknown> | null,
      )
    })
    .toEqual({
      repo: sourceRepositoryFullName,
      base: 'main',
      head: sourceHeadBranchSibling,
      prTitle: 'Source sibling active workspace',
      prNumber: 10,
      prContextState: 'active',
      componentContent: 'export const App = () => <main>Source sibling content</main>',
    })

  await expect
    .poll(async () => {
      const targetRecord = await getWorkspaceTabsRecord(page, {
        headBranch: targetHeadBranch,
      })
      return toRecordIntegritySnapshot(targetRecord as Record<string, unknown> | null)
    })
    .toEqual({
      repo: targetRepositoryFullName,
      base: 'main',
      head: targetHeadBranch,
      prTitle: 'Target active workspace',
      prNumber: 2,
      prContextState: 'active',
      componentContent: 'export const App = () => <main>Target content</main>',
    })
})

test('Switching active workspace to cross-repo closed preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceCrossRepoSwitchIntegrityScenario({
    page,
    targetState: 'closed',
  })
  await expect(page.getByRole('status', { name: 'App status' })).toContainText('Rendered')
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
  await expect(
    page.getByRole('listitem', { name: 'Workspace tab App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Workspace editor tabs' }).getByRole('listitem'),
  ).toHaveCount(1)
  await expect(page.locator('#preview-host iframe')).toHaveCount(0)

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const closedRecord = records.find(
        record =>
          record?.repo === 'knightedcodemonkey/develop' &&
          record?.prContextState === 'closed' &&
          record?.prNumber === 2,
      )

      return {
        prContextState: closedRecord?.prContextState,
        prNumber: closedRecord?.prNumber,
      }
    })
    .toEqual({
      prContextState: 'closed',
      prNumber: 2,
    })
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
})

test('Active PR context rehydrates after token remove and re-add', async ({ page }) => {
  const githubHeadBranch = 'css/rehydrate-test'
  const staleLocalHeadBranch = 'css/stale-local-head'

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
    'knightedcodemonkey/css': ['main', 'release', githubHeadBranch],
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
          head: { ref: githubHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: `refs/heads/${githubHeadBranch}`,
          object: { type: 'commit', sha: 'rehydrate-head-sha' },
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
    headBranch: staleLocalHeadBranch,
    prTitle: 'Saved css PR context',
    prNumber: 7,
    renderMode: 'react',
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await openMostRecentStoredWorkspaceContext(page)

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeVisible()
  await expect(page.getByLabel('Head')).toHaveValue(githubHeadBranch)

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const restoredRecord = records.find(
        record =>
          record?.repo === 'knightedcodemonkey/css' &&
          record?.prNumber === 7 &&
          record?.prTitle === 'Saved css PR context',
      )

      return Boolean(restoredRecord)
    })
    .toBe(true)

  await removeSavedGitHubToken(page)
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'GitHub token removed',
  )

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await openMostRecentStoredWorkspaceContext(page)

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeVisible()

  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
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

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/css/rehydrate-test',
          object: { type: 'commit', sha: 'rehydrate-closed-head-sha' },
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
  await openMostRecentStoredWorkspaceContext(page)
  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
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
  await openMostRecentStoredWorkspaceContext(page)

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
  ).toContainText('Repository is selected from Workspaces.')
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

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/develop/open-pr-test',
          object: { type: 'commit', sha: 'recovered-pr-head-sha' },
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
