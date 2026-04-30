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

test('Switching active workspace to inactive preserves switched-from record integrity', async ({
  page,
}) => {
  await runActiveWorkspaceSwitchIntegrityScenario({
    page,
    targetState: 'inactive',
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

test('Switching active workspaces with different module sync paths keeps remote sync isolated per path', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const alphaHeadBranch = 'develop/issue-alpha-sync'
  const betaHeadBranch = 'develop/issue-beta-sync'
  const alphaWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: alphaHeadBranch,
  })
  const betaWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: betaHeadBranch,
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
    [repositoryFullName]: ['main', alphaHeadBranch, betaHeadBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/21',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 21,
          state: 'open',
          title: 'Alpha active workspace',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/21',
          head: { ref: alphaHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/22',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 22,
          state: 'open',
          title: 'Beta active workspace',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/22',
          head: { ref: betaHeadBranch },
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
          ref: `refs/heads/${alphaHeadBranch}`,
          object: { type: 'commit', sha: 'active-sync-switch-sha' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/contents/**',
    async route => {
      const url = new URL(route.request().url())
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '').trim()
      const ref = url.searchParams.get('ref') ?? ''
      const keyedPath = `${ref}:${path}`

      const contentByBranchPath: Record<string, string> = {
        [`${alphaHeadBranch}:src/components/alpha-widget.tsx`]:
          'export const AlphaWidget = () => <main>Alpha synced</main>',
        [`${alphaHeadBranch}:src/styles/app.css`]: '.alpha { color: coral; }',
        [`${betaHeadBranch}:src/components/beta-widget.tsx`]:
          'export const BetaWidget = () => <main>Beta synced</main>',
        [`${betaHeadBranch}:src/styles/app.css`]: '.beta { color: steelblue; }',
      }

      const content = contentByBranchPath[keyedPath]
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
          sha: `sha-${ref}-${path}`,
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
      id: alphaWorkspaceId,
      repo: repositoryFullName,
      base: 'main',
      head: alphaHeadBranch,
      prTitle: 'Alpha active workspace',
      prNumber: 21,
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
          content: 'export const App = () => <main>Alpha local entry</main>',
        },
        {
          id: 'alpha-styles-tab',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: '.alpha { color: #111; }',
        },
        {
          id: 'alpha-widget-tab',
          name: 'alpha-widget.tsx',
          path: 'src/components/alpha-widget.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: true,
          content: 'export const AlphaWidget = () => <main>Alpha local module</main>',
        },
      ],
      activeTabId: 'alpha-widget-tab',
      createdAt: now - 120_000,
      lastModified: now - 120_000,
    },
    {
      id: betaWorkspaceId,
      repo: repositoryFullName,
      base: 'main',
      head: betaHeadBranch,
      prTitle: 'Beta active workspace',
      prNumber: 22,
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
          content: 'export const App = () => <main>Beta local entry</main>',
        },
        {
          id: 'beta-styles-tab',
          name: 'app.css',
          path: 'src/styles/app.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: '.beta { color: #111; }',
        },
        {
          id: 'beta-widget-tab',
          name: 'beta-widget.tsx',
          path: 'src/components/beta-widget.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: true,
          content: 'export const BetaWidget = () => <main>Beta local module</main>',
        },
      ],
      activeTabId: 'beta-widget-tab',
      createdAt: now - 60_000,
      lastModified: now - 60_000,
    },
  ])

  await connectByotWithSingleRepo(page)

  await openStoredWorkspaceContextByHead(page, alphaHeadBranch)
  await openStoredWorkspaceContextByHead(page, betaHeadBranch)

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const alphaRecord = records.find(record => {
        const recordId = typeof record?.id === 'string' ? record.id.trim() : ''
        const recordHead = typeof record?.head === 'string' ? record.head.trim() : ''
        return recordId === alphaWorkspaceId || recordHead === alphaHeadBranch
      })
      const betaRecord = records.find(record => {
        const recordId = typeof record?.id === 'string' ? record.id.trim() : ''
        const recordHead = typeof record?.head === 'string' ? record.head.trim() : ''
        return recordId === betaWorkspaceId || recordHead === betaHeadBranch
      })

      const alphaTabs = Array.isArray(alphaRecord?.tabs)
        ? (alphaRecord.tabs as Array<Record<string, unknown>>)
        : []
      const betaTabs = Array.isArray(betaRecord?.tabs)
        ? (betaRecord.tabs as Array<Record<string, unknown>>)
        : []

      const alphaModule = alphaTabs.find(
        tab =>
          typeof tab?.path === 'string' &&
          tab.path.trim() === 'src/components/alpha-widget.tsx',
      )
      const betaModule = betaTabs.find(
        tab =>
          typeof tab?.path === 'string' &&
          tab.path.trim() === 'src/components/beta-widget.tsx',
      )

      const alphaModuleContent =
        typeof alphaModule?.content === 'string' ? alphaModule.content.trim() : ''
      const betaModuleContent =
        typeof betaModule?.content === 'string' ? betaModule.content.trim() : ''

      return {
        alphaModulePresent: Boolean(alphaModule),
        alphaHasBetaContent:
          alphaModuleContent ===
            'export const BetaWidget = () => <main>Beta synced</main>' ||
          alphaModuleContent ===
            'export const BetaWidget = () => <main>Beta local module</main>',
        betaHasAlphaContent:
          betaModuleContent ===
            'export const AlphaWidget = () => <main>Alpha synced</main>' ||
          betaModuleContent ===
            'export const AlphaWidget = () => <main>Alpha local module</main>',
      }
    })
    .toEqual({
      alphaModulePresent: true,
      alphaHasBetaContent: false,
      betaHasAlphaContent: false,
    })
})

test('Switching active repository workspaces B->A->B preserves each workspace tab content', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const alphaHeadBranch = 'develop/issue-alpha-roundtrip'
  const betaHeadBranch = 'develop/issue-beta-roundtrip'

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
    [repositoryFullName]: ['main', alphaHeadBranch, betaHeadBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/31',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 31,
          state: 'open',
          title: 'Alpha active workspace',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/31',
          head: { ref: alphaHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/32',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 32,
          state: 'open',
          title: 'Beta active workspace',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/32',
          head: { ref: betaHeadBranch },
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
          ref: `refs/heads/${alphaHeadBranch}`,
          object: { type: 'commit', sha: 'roundtrip-active-sha' },
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

  await waitForAppReady(page, `${appEntryPath}`)

  const now = Date.now()
  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch: alphaHeadBranch,
      }),
      repo: repositoryFullName,
      base: 'main',
      head: alphaHeadBranch,
      prTitle: 'Alpha active workspace',
      prNumber: 31,
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
          content: 'export const App = () => <main>Alpha unique entry</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: now - 120_000,
      lastModified: now - 120_000,
    },
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch: betaHeadBranch,
      }),
      repo: repositoryFullName,
      base: 'main',
      head: betaHeadBranch,
      prTitle: 'Beta active workspace',
      prNumber: 32,
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
          content: 'export const App = () => <main>Beta unique entry</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: now - 60_000,
      lastModified: now - 60_000,
    },
  ])

  await connectByotWithSingleRepo(page)

  await openStoredWorkspaceContextByHead(page, betaHeadBranch)
  await openStoredWorkspaceContextByHead(page, alphaHeadBranch)
  await openStoredWorkspaceContextByHead(page, betaHeadBranch)

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const alphaRecord = records.find(
        record =>
          typeof record?.head === 'string' && record.head.trim() === alphaHeadBranch,
      )
      const betaRecord = records.find(
        record =>
          typeof record?.head === 'string' && record.head.trim() === betaHeadBranch,
      )

      const alphaComponent = Array.isArray(alphaRecord?.tabs)
        ? (alphaRecord.tabs as Array<Record<string, unknown>>).find(
            tab => tab?.id === 'component',
          )
        : null
      const betaComponent = Array.isArray(betaRecord?.tabs)
        ? (betaRecord.tabs as Array<Record<string, unknown>>).find(
            tab => tab?.id === 'component',
          )
        : null

      return {
        alpha: typeof alphaComponent?.content === 'string' ? alphaComponent.content : '',
        beta: typeof betaComponent?.content === 'string' ? betaComponent.content : '',
      }
    })
    .toEqual({
      alpha: 'export const App = () => <main>Alpha unique entry</main>',
      beta: 'export const App = () => <main>Beta unique entry</main>',
    })
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
  await expect
    .poll(async () => {
      const statusText = await page
        .getByRole('status', { name: 'Open pull request status', includeHidden: true })
        .textContent()
      const normalizedStatus = typeof statusText === 'string' ? statusText.trim() : ''
      return (
        normalizedStatus.includes('Saved pull request context is not open on GitHub.') ||
        normalizedStatus.includes(
          'Repository is selected from Workspaces. Configure branch details and commit metadata.',
        )
      )
    })
    .toBe(true)
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
  expect(updateRefRequests).toHaveLength(1)

  await expect(
    page
      .getByRole('listitem', { name: 'Workspace tab App.tsx' })
      .locator('.workspace-tab__dirty-indicator'),
  ).toHaveCount(0)
  await expect(page.locator('#component-dirty-status')).toBeHidden()
  await expect
    .poll(async () => {
      const workspaceRecord = await getWorkspaceTabsRecord(page, {
        headBranch: 'develop/open-pr-test',
      })
      const tabs = Array.isArray(workspaceRecord?.tabs)
        ? (workspaceRecord.tabs as Array<Record<string, unknown>>)
        : []
      const hasEntryTab = tabs.some(tab => tab?.role === 'entry')
      const hasStyleTab = tabs.some(tab => {
        const language =
          typeof tab?.language === 'string' ? tab.language.trim().toLowerCase() : ''
        return language === 'css' || language === 'less' || language === 'sass'
      })
      const hasPrimaryTabs = hasEntryTab && hasStyleTab
      return hasPrimaryTabs && tabs.every(tab => tab?.isDirty === false)
    })
    .toBe(true)

  await ensureOpenPrDrawerOpen(page)

  await pushCommitButton.evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('No local editor changes to push.')
  expect(updateRefRequests).toHaveLength(1)
  await expect(page.locator('#clear-confirm-dialog')).toBeHidden()
})
