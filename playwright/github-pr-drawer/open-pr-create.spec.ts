import { expect, test } from '@playwright/test'
import type {
  CreateRefRequestBody,
  PullRequestCreateBody,
} from '../helpers/app-test-helpers.js'
import {
  addWorkspaceTab,
  appEntryPath,
  buildWorkspaceRecordId,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  getAllWorkspaceRecords,
  getLocalContextOptionLabels,
  getWorkspaceRecordId,
  getWorkspaceTabsRecord,
  mockRepositoryBranches,
  openStoredWorkspaceContextByHead,
  openStoredWorkspaceContextById,
  resetWorkbenchStorage,
  seedLocalWorkspaceContexts,
  selectWorkspacesRepositoryFilter,
  setComponentEditorSource,
  setStylesEditorSource,
  submitOpenPrAndConfirm,
  waitForAppReady,
} from './github-pr-drawer.helpers.js'

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

  await expect
    .poll(async () => {
      const record = await getWorkspaceTabsRecord(page, {
        headBranch: 'Develop/Open-Pr-Test',
      })
      return {
        prContextState:
          typeof record?.prContextState === 'string' ? record.prContextState : '',
        prNumber:
          typeof record?.prNumber === 'number' && Number.isFinite(record.prNumber)
            ? record.prNumber
            : null,
        prTitle: typeof record?.prTitle === 'string' ? record.prTitle : '',
      }
    })
    .toEqual({
      prContextState: 'active',
      prNumber: 42,
      prTitle: 'Apply editor updates from develop',
    })
})

test('Open PR ignores stale rename target deletions from workspace metadata', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const workspaceHeadBranch = 'feat/stale-target-path-metadata'
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
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release'],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'stale-open-pr-main-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/stale-open-pr-main-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'stale-open-pr-main-sha',
          tree: { sha: 'stale-open-pr-base-tree' },
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
        body: JSON.stringify({ sha: 'stale-open-pr-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'stale-open-pr-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/feat/stale-target-path-open-pr' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ref: 'refs/heads/feat/stale-target-path-open-pr' }),
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
          number: 144,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/144',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  const now = Date.now()
  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch: workspaceHeadBranch,
      }),
      repo: repositoryFullName,
      base: 'main',
      head: workspaceHeadBranch,
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
          isActive: false,
          content: 'const App = () => <button>A</button>',
          targetPrFilePath: 'src/components/App.tsx',
          syncedContent: 'const App = () => <button>A</button>',
          syncedAt: now,
          isDirty: false,
        },
        {
          id: 'styles',
          name: 'styles.css',
          path: 'src/styles.css',
          language: 'css',
          role: 'module',
          isActive: true,
          content: 'button { color: tomato; }',
          targetPrFilePath: 'src/styles/app.css',
          syncedContent: 'button { color: tomato; }',
          syncedAt: now,
          isDirty: true,
        },
      ],
      activeTabId: 'styles',
      createdAt: now,
      lastModified: now,
    },
  ])

  await connectByotWithSingleRepo(page)
  await openStoredWorkspaceContextByHead(page, workspaceHeadBranch)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('feat/stale-target-path-open-pr')
  await page.getByLabel('PR title').fill('Do not delete stale target path on open PR')
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/144',
  )

  expect(treeRequests).toHaveLength(1)
  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  const paths = treePayload?.map(file => String(file.path ?? '')) ?? []

  expect(paths).toContain('src/components/App.tsx')
  expect(paths).toContain('src/styles.css')
  expect(paths).not.toContain('src/styles/app.css')
})

test('Push commit in active PR mode commits only dirty module path when entry is unchanged', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const headBranch = 'develop/module-only-push'
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
          title: 'Module-only commit PR',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: headBranch },
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
          ref: `refs/heads/${headBranch}`,
          object: { type: 'commit', sha: 'module-push-head-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits/module-push-head-sha',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'module-push-head-sha',
          tree: { sha: 'module-push-base-tree' },
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
        body: JSON.stringify({ sha: 'module-push-tree-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/commits',
    async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'module-push-commit-sha' }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs/**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ref: `refs/heads/${headBranch}` }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  const now = Date.now()
  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch,
      }),
      repo: repositoryFullName,
      base: 'main',
      head: headBranch,
      prTitle: 'Module-only commit PR',
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
          content: 'export const App = () => <main>Entry unchanged</main>',
          targetPrFilePath: 'src/components/App.tsx',
          syncedContent: 'export const App = () => <main>Entry unchanged</main>',
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
          content: '.entry { color: #111; }',
          targetPrFilePath: 'src/styles/app.css',
          syncedContent: '.entry { color: #111; }',
          syncedAt: now,
          isDirty: false,
        },
        {
          id: 'module-card-tab',
          name: 'feature-card.tsx',
          path: 'src/components/feature-card.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: true,
          content: 'export const FeatureCard = () => <aside>local card</aside>',
          targetPrFilePath: 'src/components/feature-card.tsx',
          syncedContent: 'export const FeatureCard = () => <aside>local card</aside>',
          syncedAt: now,
          isDirty: false,
        },
      ],
      activeTabId: 'module-card-tab',
      createdAt: now,
      lastModified: now,
    },
  ])

  await connectByotWithSingleRepo(page)
  await openStoredWorkspaceContextByHead(page, headBranch)

  await page.getByRole('button', { name: 'Open tab feature-card.tsx' }).click()
  await expect(page.getByRole('region', { name: 'feature-card.tsx' })).toBeVisible()
  const componentEditor = page
    .locator('.editor-panel[data-editor-kind="component"] .cm-content')
    .first()
  await componentEditor.fill(
    'export const FeatureCard = () => <aside>remote-safe card</aside>',
  )
  await componentEditor.press('End')
  await componentEditor.type(' ')
  await componentEditor.press('Backspace')

  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Include entry tab').uncheck()
  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByText('feature-card.tsx -> src/components/feature-card.tsx', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    dialog.getByText('App.tsx -> src/components/App.tsx', { exact: true }),
  ).toHaveCount(0)

  await dialog.locator('button[value="confirm"]').evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(`Commit pushed to ${headBranch}`)

  expect(treeRequests).toHaveLength(1)
  const treePayload = treeRequests[0]?.tree as Array<Record<string, unknown>>
  const paths = treePayload?.map(file => String(file.path ?? '')) ?? []
  expect(paths).toContain('src/components/feature-card.tsx')
  expect(paths).not.toContain('src/components/App.tsx')
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

test('Workspaces repository selector filters contexts and keeps local-only contexts under Local', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'repo_knightedcodemonkey_develop_feat-local-alpha',
      repo: 'knightedcodemonkey/develop',
      workspaceScope: 'local',
      head: 'feat/local-alpha',
      prTitle: 'Alpha local context',
      prContextState: 'inactive',
      prNumber: null,
    },
    {
      id: 'workspace_feat-active-alpha',
      repo: 'knightedcodemonkey/develop',
      head: 'feat/active-alpha',
      prTitle: 'Alpha active context',
      prContextState: 'active',
      prNumber: 41,
    },
    {
      id: 'repo_knightedcodemonkey_css_feat-active-css',
      repo: 'knightedcodemonkey/css',
      head: 'feat/active-css',
      prTitle: 'CSS active context',
      prContextState: 'active',
      prNumber: 51,
    },
  ])

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

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  const developLabels = await getLocalContextOptionLabels(page)
  expect(developLabels).toEqual(['Select a stored workspace', 'Alpha active context'])

  await selectWorkspacesRepositoryFilter(page, '__local__')
  const localLabels = await getLocalContextOptionLabels(page)
  expect(localLabels).toContain('Select a stored workspace')
  expect(localLabels).toContain('local:Alpha local context')
  expect(localLabels).not.toContain('Alpha active context')
})

test('Workspaces repository with no stored entries hides Workspace select and supports Initialize', async ({
  page,
}) => {
  const seededRecordId = 'local_seed_initialize_preserved'
  const seededHead = 'feat/local-preserved'

  await waitForAppReady(page, `${appEntryPath}`)
  await seedLocalWorkspaceContexts(page, [
    {
      id: seededRecordId,
      repo: '',
      base: 'main',
      head: seededHead,
      prTitle: 'Seed local context',
      prNumber: null,
      prContextState: 'inactive',
    },
  ])

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
      ]),
    })
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  const pullRequestRepository = page.getByLabel('Pull request repository')
  const repositoryValueBeforeScopeSelection = await pullRequestRepository.inputValue()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  await expect(page.getByLabel('Stored workspace')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'New workspace', exact: true }),
  ).toBeHidden()

  const beforeInitializeRecord = (await getAllWorkspaceRecords(page)).find(
    record => record?.id === seededRecordId,
  )
  expect(beforeInitializeRecord).toBeTruthy()
  expect(
    typeof beforeInitializeRecord?.repo === 'string' ? beforeInitializeRecord.repo : '',
  ).toBe('')
  await expect(pullRequestRepository).toHaveValue(repositoryValueBeforeScopeSelection)

  const initializeButton = page.getByRole('button', {
    name: 'Initialize',
    exact: true,
  })
  await expect(initializeButton).toBeVisible()
  await initializeButton.click()

  await ensureOpenPrDrawerOpen(page)
  await expect(pullRequestRepository).toHaveValue('knightedcodemonkey/develop')

  await expect
    .poll(async () => {
      const updatedRecord = (await getAllWorkspaceRecords(page)).find(
        record => record?.id === seededRecordId,
      )
      return {
        seededRepo: typeof updatedRecord?.repo === 'string' ? updatedRecord.repo : '',
        seededWorkspaceKey:
          typeof updatedRecord?.workspaceKey === 'string'
            ? updatedRecord.workspaceKey
            : '',
        repositoryScopedCount: (await getAllWorkspaceRecords(page)).filter(record => {
          const repo = typeof record?.repo === 'string' ? record.repo : ''
          const workspaceKey =
            typeof record?.workspaceKey === 'string' ? record.workspaceKey : ''
          return (
            repo === 'knightedcodemonkey/develop' &&
            workspaceKey.includes('knightedcodemonkey-develop::')
          )
        }).length,
      }
    })
    .toEqual({
      seededRepo: '',
      seededWorkspaceKey: '',
      repositoryScopedCount: 1,
    })

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      return records.filter(record => record?.head === seededHead).length
    })
    .toBe(1)
})

test('Local New workspace always creates a new stored workspace snapshot', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'local_seed_duplicate_key_guard',
      repo: '',
      base: 'main',
      head: 'feat/component-seeded',
      prTitle: 'Seed local context',
      prNumber: null,
      prContextState: 'inactive',
    },
  ])

  await page.reload()
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)

  const countLocalRecords = async () => {
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
        const records = await new Promise<Array<{ repo?: unknown }>>(
          (resolve, reject) => {
            getAllRequest.onsuccess = () => {
              resolve(Array.isArray(getAllRequest.result) ? getAllRequest.result : [])
            }
            getAllRequest.onerror = () => reject(getAllRequest.error)
          },
        )

        return records.filter(record => {
          const repo = typeof record?.repo === 'string' ? record.repo.trim() : ''
          return !repo
        }).length
      } finally {
        db.close()
      }
    })
  }

  await selectWorkspacesRepositoryFilter(page, '__local__')

  const initialLocalRecordCount = await countLocalRecords()
  await page.getByRole('button', { name: 'New workspace', exact: true }).click()

  await expect.poll(async () => countLocalRecords()).toBe(initialLocalRecordCount + 1)
})

test('Non-Local New workspace forks a new repository-scoped workspace when entries exist', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const seededHead = 'feat/repo-seeded-workspace'

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'repo_seed_for_non_local_fork',
      repo: repositoryFullName,
      base: 'main',
      head: seededHead,
      prTitle: 'Seed repository context',
      prNumber: null,
      prContextState: 'inactive',
    },
  ])

  await page.reload()
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await selectWorkspacesRepositoryFilter(page, repositoryFullName)

  const countRepositoryRecords = async () => {
    const records = await getAllWorkspaceRecords(page)
    return records.filter(record => {
      const repo = typeof record?.repo === 'string' ? record.repo.trim() : ''
      return repo === repositoryFullName
    }).length
  }

  const initialRepositoryCount = await countRepositoryRecords()
  await expect(page.getByRole('button', { name: 'Initialize', exact: true })).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'New workspace', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New workspace', exact: true }).click()

  await expect.poll(async () => countRepositoryRecords()).toBe(initialRepositoryCount + 1)

  const persistedRecords = await getAllWorkspaceRecords(page)
  const forkedRepositoryRecord = persistedRecords.find(record => {
    const id = typeof record?.id === 'string' ? record.id.trim() : ''
    const repo = typeof record?.repo === 'string' ? record.repo.trim() : ''
    return repo === repositoryFullName && id !== 'repo_seed_for_non_local_fork'
  })

  expect(forkedRepositoryRecord).toBeTruthy()
  expect(typeof forkedRepositoryRecord?.workspaceKey).toBe('string')
  const forkedWorkspaceKey = String(forkedRepositoryRecord?.workspaceKey ?? '')
  expect(forkedWorkspaceKey).toContain('knightedcodemonkey-develop::')
  expect(
    typeof forkedRepositoryRecord?.prTitle === 'string'
      ? forkedRepositoryRecord.prTitle
      : '',
  ).toBe('')
  expect(typeof forkedRepositoryRecord?.head).toBe('string')
  expect(String(forkedRepositoryRecord?.head ?? '')).not.toBe(seededHead)
})

test('Switching Workspaces repository scope to Local keeps inactive record repo and shows it as local in drawer', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/contract-case'
  const headBranch = 'feat/component-v8zw'

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'repo_knightedcodemonkey_contract-case_feat-component-v8zw',
      repo: repositoryFullName,
      base: 'main',
      head: headBranch,
      prTitle: '',
      prNumber: null,
      prContextState: 'inactive',
    },
  ])

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'contract-case',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', headBranch],
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await selectWorkspacesRepositoryFilter(page, repositoryFullName)
  await openStoredWorkspaceContextByHead(page, headBranch)
  await selectWorkspacesRepositoryFilter(page, '__local__')

  await expect
    .poll(async () => {
      const localLabels = await getLocalContextOptionLabels(page)
      return localLabels.includes('local:feat/component-v8zw')
    })
    .toBe(true)

  await expect
    .poll(async () => {
      const record = await getWorkspaceTabsRecord(page, {
        headBranch,
      })

      return typeof record?.repo === 'string' ? record.repo : null
    })
    .toBe(repositoryFullName)

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      return records.filter(record => record?.head === headBranch).length
    })
    .toBe(1)
})

test('Blank-slate startup persists inactive local workspace before PAT', async ({
  page,
}) => {
  await resetWorkbenchStorage(page)

  await waitForAppReady(page, `${appEntryPath}`)

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      if (!Array.isArray(records) || records.length === 0) {
        return false
      }

      const latest = records.slice().sort((a, b) => {
        const aLastModified =
          typeof a?.lastModified === 'number' && Number.isFinite(a.lastModified)
            ? a.lastModified
            : 0
        const bLastModified =
          typeof b?.lastModified === 'number' && Number.isFinite(b.lastModified)
            ? b.lastModified
            : 0
        return bLastModified - aLastModified
      })[0]

      return (
        latest?.prContextState === 'inactive' &&
        latest?.prNumber === null &&
        typeof latest?.repo === 'string'
      )
    })
    .toBe(true)
})

test('Fresh PAT bootstrap does not persist drawer head metadata to IDB before submit', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/contract-case'

  await resetWorkbenchStorage(page)

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'contract-case',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release'],
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await selectWorkspacesRepositoryFilter(page, repositoryFullName)
  await page.getByRole('button', { name: 'Initialize', exact: true }).click()

  const initialRecord = await getWorkspaceTabsRecord(page)
  const initialRecordId = getWorkspaceRecordId(initialRecord)
  expect(initialRecordId).not.toBe('')

  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Head').fill('develop/fresh-pat-bootstrap')
  await page.getByLabel('Head').blur()

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const matching = records.filter(record => record?.id === initialRecordId)
      const latest = matching.sort((left, right) => {
        const leftModified =
          typeof left?.lastModified === 'number' && Number.isFinite(left.lastModified)
            ? left.lastModified
            : 0
        const rightModified =
          typeof right?.lastModified === 'number' && Number.isFinite(right.lastModified)
            ? right.lastModified
            : 0
        return rightModified - leftModified
      })[0]

      return {
        count: matching.length,
        id: typeof latest?.id === 'string' ? latest.id : '',
        head: typeof latest?.head === 'string' ? latest.head : '',
      }
    })
    .toEqual({
      count: 1,
      id: initialRecordId,
      head: typeof initialRecord?.head === 'string' ? initialRecord.head : '',
    })

  const updatedRecord = (await getAllWorkspaceRecords(page)).find(
    record => record?.id === initialRecordId,
  )
  expect(updatedRecord?.head).toBe(initialRecord?.head)
})

test('Changing head does not update current workspace without explicit submit', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/contract-case'

  await resetWorkbenchStorage(page)

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'contract-case',
          full_name: repositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [repositoryFullName]: ['main', 'release'],
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await selectWorkspacesRepositoryFilter(page, repositoryFullName)
  await page.getByRole('button', { name: 'Initialize', exact: true }).click()

  const initialRecord = await getWorkspaceTabsRecord(page)
  const initialRecordId = getWorkspaceRecordId(initialRecord)
  expect(initialRecordId).not.toBe('')

  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Head').fill('develop/head-first')
  await page.getByLabel('Head').blur()
  await page.getByLabel('Head').fill('develop/head-second')
  await page.getByLabel('Head').blur()

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const matching = records.filter(record => record?.id === initialRecordId)
      const latest = matching.sort((left, right) => {
        const leftModified =
          typeof left?.lastModified === 'number' && Number.isFinite(left.lastModified)
            ? left.lastModified
            : 0
        const rightModified =
          typeof right?.lastModified === 'number' && Number.isFinite(right.lastModified)
            ? right.lastModified
            : 0
        return rightModified - leftModified
      })[0]

      return {
        count: matching.length,
        id: typeof latest?.id === 'string' ? latest.id : '',
        head: typeof latest?.head === 'string' ? latest.head : '',
      }
    })
    .toEqual({
      count: 1,
      id: initialRecordId,
      head: typeof initialRecord?.head === 'string' ? initialRecord.head : '',
    })
})

for (const prContextState of ['inactive', 'closed'] as const) {
  test(`Head stays fixed across repository changes for ${prContextState} workspace context`, async ({
    page,
    browserName,
  }) => {
    // WebKit-only quarantine: keep these specs active on Chromium while CI flake is investigated.
    test.fixme(
      browserName === 'webkit',
      'Temporarily quarantined on WebKit due CI-only Workspaces drawer timing flake.',
    )

    const sourceRepository = 'knightedcodemonkey/contract-case'
    const targetRepository = 'knightedcodemonkey/develop-sandbox'
    const workspaceHead = 'feat/component-j101'
    const workspaceId = buildWorkspaceRecordId({
      repositoryFullName: sourceRepository,
      headBranch: workspaceHead,
    })

    await resetWorkbenchStorage(page)

    await page.route('https://api.github.com/user/repos**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 12,
            owner: { login: 'knightedcodemonkey' },
            name: 'contract-case',
            full_name: sourceRepository,
            default_branch: 'main',
            permissions: { push: true },
          },
          {
            id: 13,
            owner: { login: 'knightedcodemonkey' },
            name: 'develop-sandbox',
            full_name: targetRepository,
            default_branch: 'main',
            permissions: { push: true },
          },
        ]),
      })
    })

    await mockRepositoryBranches(page, {
      [sourceRepository]: ['main', 'release', workspaceHead],
      [targetRepository]: ['main', 'release'],
    })

    await waitForAppReady(page, `${appEntryPath}`)

    await seedLocalWorkspaceContexts(page, [
      {
        id: workspaceId,
        repo: sourceRepository,
        base: 'main',
        head: workspaceHead,
        prTitle: '',
        prNumber: null,
        prContextState,
        renderMode: 'dom',
        tabs: [
          {
            id: 'component',
            name: 'App.tsx',
            path: 'src/components/App.tsx',
            language: 'javascript-jsx',
            role: 'entry',
            isActive: true,
            content: 'export const App = () => <main>Workspace context</main>',
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

    await openStoredWorkspaceContextById(page, workspaceId)

    await ensureOpenPrDrawerOpen(page)
    await expect(page.getByLabel('Pull request repository')).toHaveValue(sourceRepository)
    await expect(page.getByLabel('Head')).toHaveValue(workspaceHead)

    await selectWorkspacesRepositoryFilter(page, targetRepository)
    await ensureOpenPrDrawerOpen(page)
    await expect(page.getByLabel('Pull request repository')).toHaveValue(sourceRepository)

    await expect(page.getByLabel('Head')).toHaveValue(workspaceHead)
    await expect
      .poll(async () => {
        const record = await getWorkspaceTabsRecord(page, { headBranch: workspaceHead })
        return record?.head === workspaceHead
      })
      .toBe(true)
  })
}

test('Open PR promotes inactive workspace with stable record id when repository changes', async ({
  page,
  browserName,
}) => {
  // WebKit-only quarantine: keep this spec active on Chromium while CI flake is investigated.
  test.fixme(
    browserName === 'webkit',
    'Temporarily quarantined on WebKit due CI-only Workspaces drawer timing flake.',
  )

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

  await openStoredWorkspaceContextById(page, oldWorkspaceId)

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(oldRepository)
  await selectWorkspacesRepositoryFilter(page, newRepository)
  await page.getByRole('button', { name: 'Initialize', exact: true }).click()
  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(newRepository)

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

  const promotedActiveRecord = recordsByHead.find(
    record => record?.repo === newRepository && record?.prContextState === 'active',
  )

  expect(promotedActiveRecord?.id).toBe(oldWorkspaceId)
  expect(promotedActiveRecord?.prNumber).toBe(88)

  expect(recordsByHead).toHaveLength(1)
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

test('Open PR drawer hard-fails when requested head branch already exists', async ({
  page,
}) => {
  let createRefRequestCount = 0
  let treeRequestCount = 0
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
        body: JSON.stringify({
          ref: 'refs/heads/main',
          object: { type: 'commit', sha: 'abc123mainsha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/refs',
    async route => {
      createRefRequestCount += 1
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Reference already exists',
          documentation_url: 'https://docs.github.com/rest/git/refs#create-a-reference',
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/trees',
    async route => {
      treeRequestCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ sha: 'new-tree-sha' }),
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
          number: 77,
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/77',
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('feat/A')
  await page.getByLabel('PR title').fill('Should fail for existing branch')
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Open PR failed: Branch feat/A already exists. Choose another branch name and retry.',
  )

  expect(createRefRequestCount).toBe(1)
  expect(treeRequestCount).toBe(0)
  expect(pullRequestRequestCount).toBe(0)
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
  await expect(repoSelect).toBeDisabled()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  await page.getByRole('button', { name: 'Initialize', exact: true }).click()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')
  await expect(baseSelect).toHaveValue('main')
  await expect(baseSelect.getByRole('option')).toHaveText(['main', 'develop-next'])

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/css')
  await page.getByRole('button', { name: 'Initialize', exact: true }).click()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/css')
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

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Head').fill('examples/develop/head')
  await page.getByLabel('Head').blur()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/css')
  await ensureOpenPrDrawerOpen(page)
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

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Head').fill('examples/develop/head')
  await page.getByLabel('Head').blur()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/css')

  const legacyKeys = await page.evaluate(() => {
    const storagePrefix = 'knighted:develop:github-pr-config:'
    return Object.keys(localStorage).filter(key => key.startsWith(storagePrefix))
  })

  expect(legacyKeys).toHaveLength(0)
})

test('Open PR repository field stays read-only while Workspaces controls repository selection', async ({
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
  const initialRepoValue = await repoSelect.inputValue()
  await expect(repoSelect).toBeDisabled()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  await expect(page.getByRole('complementary', { name: 'Workspaces' })).toBeVisible()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue(initialRepoValue)
  await expect(repoSelect).toBeDisabled()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/css')
  await expect(page.getByRole('complementary', { name: 'Workspaces' })).toBeVisible()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue(initialRepoValue)
  await expect(repoSelect).toBeDisabled()
})
