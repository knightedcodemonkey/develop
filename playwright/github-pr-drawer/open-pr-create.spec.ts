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
  await page.getByLabel('Workspace repository filter').selectOption('__local__')

  const search = page.getByLabel('Search stored local contexts')
  await expect(search).toBeEnabled()
  await search.fill('beta')

  const labels = await getLocalContextOptionLabels(page)
  expect(labels).toEqual(['Select a stored local context', 'local:Beta local context'])
})

test('Workspaces repository selector filters contexts and keeps local-only contexts under Local', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'repo_knightedcodemonkey_develop_feat-local-alpha',
      repo: 'knightedcodemonkey/develop',
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
  expect(developLabels).toEqual(['Select a stored local context', 'Alpha active context'])

  await selectWorkspacesRepositoryFilter(page, '__local__')
  const localLabels = await getLocalContextOptionLabels(page)
  expect(localLabels).toContain('Select a stored local context')
  expect(localLabels).toContain('local:Alpha local context')
  expect(localLabels).not.toContain('Alpha active context')
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

  const localLabels = await getLocalContextOptionLabels(page)
  expect(localLabels).toContain('local:feat/component-v8zw')

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

test('Fresh PAT bootstrap persists drawer head metadata to IDB', async ({ page }) => {
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

  const initialRecord = await getWorkspaceTabsRecord(page)
  const initialRecordId = getWorkspaceRecordId(initialRecord)
  expect(initialRecordId).not.toBe('')

  await ensureOpenPrDrawerOpen(page)
  await page.getByLabel('Head').fill('develop/fresh-pat-bootstrap')
  await page.getByLabel('Head').blur()

  await expect
    .poll(async () => {
      const selectedRepository = await page
        .getByLabel('Pull request repository')
        .inputValue()
      const drawerHead = await page.getByLabel('Head').inputValue()
      const records = await getAllWorkspaceRecords(page)

      const latestRecord = records
        .filter(record => record?.repo === selectedRepository)
        .sort((a, b) => {
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
        Boolean(selectedRepository) &&
        Boolean(drawerHead) &&
        Boolean(latestRecord) &&
        latestRecord.repo === selectedRepository &&
        latestRecord.head === drawerHead
      )
    })
    .toBe(true)

  const record = await getWorkspaceTabsRecord(page, {
    headBranch: 'develop/fresh-pat-bootstrap',
  })
  expect(record?.id).toBe(initialRecordId)
})

test('Changing head updates current workspace without creating a new record', async ({
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
      const matching = records.filter(record => record?.repo === repositoryFullName)
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
      head: 'develop/head-second',
    })
})

for (const prContextState of ['inactive', 'disconnected', 'closed'] as const) {
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
    await expect(page.getByLabel('Pull request repository')).toHaveValue(targetRepository)

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
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')
  await expect(baseSelect).toHaveValue('main')
  await expect(baseSelect.getByRole('option')).toHaveText(['main', 'develop-next'])

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/css')
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
  await expect(repoSelect).toBeDisabled()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/develop')
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')
  await expect(repoSelect).toBeDisabled()

  await selectWorkspacesRepositoryFilter(page, 'knightedcodemonkey/css')
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/css')
  await expect(repoSelect).toBeDisabled()
})
