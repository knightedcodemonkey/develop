import { expect, test } from '@playwright/test'
import type { Route } from '@playwright/test'
import {
  appEntryPath,
  buildWorkspaceRecordId,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  getWorkspaceTabsRecord,
  openStoredWorkspaceContextByHead,
  seedLocalWorkspaceContexts,
  setComponentEditorSource,
  toRecordIntegritySnapshot,
  waitForAppReady,
} from './github-pr-drawer.helpers.js'

const repositoryFullName = 'knightedcodemonkey/develop'
const sandboxRepositoryFullName = 'knightedcodemonkey/develop-sandbox'

const setupSandboxRepositoryRoutes = async ({
  page,
  pHeadBranch,
  ppHeadBranch,
  onPullRequestRequest,
}: {
  page: Parameters<typeof seedLocalWorkspaceContexts>[0]
  pHeadBranch: string
  ppHeadBranch: string
  // eslint-disable-next-line no-unused-vars
  onPullRequestRequest?: (_input: {
    pullRequestNumber: number
    route: Route
  }) => Promise<void>
}) => {
  const [repositoryOwner, repositoryName] = sandboxRepositoryFullName.split('/')

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: repositoryOwner },
          name: repositoryName,
          full_name: sandboxRepositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await page.route('https://api.github.com/repos/**/branches**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { name: 'main' },
        { name: pHeadBranch },
        { name: ppHeadBranch },
      ]),
    })
  })

  await page.route('https://api.github.com/repos/**/pulls**', async route => {
    const url = new URL(route.request().url())
    const match = url.pathname.match(/\/pulls\/(\d+)$/)
    const pullRequestNumber = match ? Number.parseInt(match[1], 10) : Number.NaN

    if (!Number.isFinite(pullRequestNumber)) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not Found' }),
      })
      return
    }

    if (typeof onPullRequestRequest === 'function') {
      await onPullRequestRequest({ pullRequestNumber, route })
      return
    }

    const headRef = pullRequestNumber === 70 ? ppHeadBranch : pHeadBranch
    const title = pullRequestNumber === 70 ? 'PP' : 'P'

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        number: pullRequestNumber,
        state: 'open',
        title,
        html_url: `https://github.com/${sandboxRepositoryFullName}/pull/${pullRequestNumber}`,
        head: { ref: headRef },
        base: { ref: 'main' },
      }),
    })
  })
}

const seedSandboxActivePpContexts = async ({
  page,
  pHeadBranch,
  ppHeadBranch,
}: {
  page: Parameters<typeof seedLocalWorkspaceContexts>[0]
  pHeadBranch: string
  ppHeadBranch: string
}) => {
  await seedLocalWorkspaceContexts(page, [
    {
      id: 'ws_45d9b895-a424-43ef-8bab-7090726f94f7',
      repo: sandboxRepositoryFullName,
      workspaceScope: 'repository',
      base: 'main',
      head: pHeadBranch,
      prTitle: 'P',
      prNumber: 69,
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
          content:
            "import { P } from '../components/module.js'\nexport const App = () => <P />\n",
        },
        {
          id: 'styles',
          name: 'styles.css',
          path: 'src/styles.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'button { padding: 10px; }\n',
        },
      ],
      activeTabId: 'component',
    },
    {
      id: 'ws_d6502674-64fd-46a6-9418-596f31067779',
      repo: sandboxRepositoryFullName,
      workspaceScope: 'repository',
      base: 'main',
      head: ppHeadBranch,
      prTitle: 'PP',
      prNumber: 70,
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
          content:
            "import { PP } from '../components/module.js'\nexport const App = () => <PP />\n",
        },
        {
          id: 'styles',
          name: 'styles.css',
          path: 'src/styles.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'p { color: red; }\n',
        },
      ],
      activeTabId: 'component',
    },
  ])
}

const seedRepositoryWorkspaces = async ({
  page,
  sourceHeadBranch,
  targetHeadBranch,
}: {
  page: Parameters<typeof seedLocalWorkspaceContexts>[0]
  sourceHeadBranch: string
  targetHeadBranch: string
}) => {
  const now = Date.now()

  await seedLocalWorkspaceContexts(page, [
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch: sourceHeadBranch,
      }),
      repo: repositoryFullName,
      workspaceScope: 'repository',
      base: 'main',
      head: sourceHeadBranch,
      prTitle: 'Source workspace',
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
          content: 'export const App = () => <main>Source baseline</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: now - 120_000,
      lastModified: now - 120_000,
    },
    {
      id: buildWorkspaceRecordId({
        repositoryFullName,
        headBranch: targetHeadBranch,
      }),
      repo: repositoryFullName,
      workspaceScope: 'repository',
      base: 'main',
      head: targetHeadBranch,
      prTitle: 'Target workspace',
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
          content: 'export const App = () => <main>Target baseline</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: now - 60_000,
      lastModified: now - 60_000,
    },
  ])
}

test('Pending debounced source edit does not overwrite switched-to workspace', async ({
  page,
}) => {
  const sourceHeadBranch = 'develop/issue-debounce-source'
  const targetHeadBranch = 'develop/issue-debounce-target'

  await waitForAppReady(page, `${appEntryPath}`)
  await seedRepositoryWorkspaces({
    page,
    sourceHeadBranch,
    targetHeadBranch,
  })

  await connectByotWithSingleRepo(page, {
    branchesByRepo: {
      [repositoryFullName]: ['main', sourceHeadBranch, targetHeadBranch],
    },
  })

  await openStoredWorkspaceContextByHead(page, sourceHeadBranch)

  const pendingSourceContent =
    'export const App = () => <main>Source pending debounce payload</main>'
  await setComponentEditorSource(page, pendingSourceContent)

  await openStoredWorkspaceContextByHead(page, targetHeadBranch)

  await expect
    .poll(async () => {
      const targetRecord = await getWorkspaceTabsRecord(page, {
        headBranch: targetHeadBranch,
      })

      return toRecordIntegritySnapshot(targetRecord)
    })
    .toMatchObject({
      repo: repositoryFullName,
      head: targetHeadBranch,
      prContextState: 'inactive',
      componentContent: 'export const App = () => <main>Target baseline</main>',
    })
})

test('Rapid A->B->A switching with pending edits avoids cross-workspace tab contamination', async ({
  page,
}) => {
  const sourceHeadBranch = 'develop/issue-roundtrip-source'
  const targetHeadBranch = 'develop/issue-roundtrip-target'

  await waitForAppReady(page, `${appEntryPath}`)
  await seedRepositoryWorkspaces({
    page,
    sourceHeadBranch,
    targetHeadBranch,
  })

  await connectByotWithSingleRepo(page, {
    branchesByRepo: {
      [repositoryFullName]: ['main', sourceHeadBranch, targetHeadBranch],
    },
  })

  await openStoredWorkspaceContextByHead(page, sourceHeadBranch)
  const sourcePendingPayload =
    'export const App = () => <main>Source pending during roundtrip</main>'
  await setComponentEditorSource(page, sourcePendingPayload)

  await openStoredWorkspaceContextByHead(page, targetHeadBranch)
  const targetPendingPayload =
    'export const App = () => <main>Target pending during roundtrip</main>'
  await setComponentEditorSource(page, targetPendingPayload)

  await openStoredWorkspaceContextByHead(page, sourceHeadBranch)

  await expect
    .poll(async () => {
      const sourceRecord = await getWorkspaceTabsRecord(page, {
        headBranch: sourceHeadBranch,
      })
      const targetRecord = await getWorkspaceTabsRecord(page, {
        headBranch: targetHeadBranch,
      })
      const sourceSnapshot = toRecordIntegritySnapshot(sourceRecord)
      const targetSnapshot = toRecordIntegritySnapshot(targetRecord)

      return {
        sourceHead: sourceSnapshot.head,
        targetHead: targetSnapshot.head,
        sourceHasTargetPayload:
          sourceSnapshot.componentContent.trim() === targetPendingPayload,
        targetHasSourcePayload:
          targetSnapshot.componentContent.trim() === sourcePendingPayload,
      }
    })
    .toEqual({
      sourceHead: sourceHeadBranch,
      targetHead: targetHeadBranch,
      sourceHasTargetPayload: false,
      targetHasSourcePayload: false,
    })
})

test('Switching between active P and PP contexts preserves record ids, keys, and tab shapes', async ({
  page,
}) => {
  const pHeadBranch = 'feat/P'
  const ppHeadBranch = 'feat/PP'
  const repository = 'knightedcodemonkey/develop-sandbox'
  const [repositoryOwner, repositoryName] = repository.split('/')

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: repositoryOwner },
          name: repositoryName,
          full_name: repository,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await page.route('https://api.github.com/repos/**/branches**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { name: 'main' },
        { name: pHeadBranch },
        { name: ppHeadBranch },
      ]),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: 'ws_45d9b895-a424-43ef-8bab-7090726f94f7',
      repo: repository,
      workspaceScope: 'repository',
      base: 'main',
      head: pHeadBranch,
      prTitle: 'P',
      prNumber: 64,
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
          content:
            "import { P } from '../components/module.js'\nexport const App = () => <P />\n",
        },
        {
          id: 'styles',
          name: 'styles.css',
          path: 'src/styles.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'p { color: white; }\n',
        },
        {
          id: 'module-mokdas01-j40ovo',
          name: 'module.tsx',
          path: 'src/components/module.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: 'export const P = () => <p>blah</p>\n',
        },
      ],
      activeTabId: 'component',
    },
    {
      id: 'ws_d6502674-64fd-46a6-9418-596f31067779',
      repo: repository,
      workspaceScope: 'repository',
      base: 'main',
      head: ppHeadBranch,
      prTitle: 'PP',
      prNumber: 65,
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
          content:
            "import { PP } from '../components/module.js'\nexport const App = () => <PP />\n",
        },
        {
          id: 'styles',
          name: 'styles.css',
          path: 'src/styles.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'p { color: red; }\n',
        },
        {
          id: 'module-mokdas01-j40ovo',
          name: 'module.tsx',
          path: 'src/components/module.tsx',
          language: 'javascript-jsx',
          role: 'module',
          isActive: false,
          content: 'export const PP = () => <p>PP</p>\n',
        },
        {
          id: 'style-mokddymb-ehiken',
          name: 'module.css',
          path: 'src/styles/module.css',
          language: 'css',
          role: 'module',
          isActive: false,
          content: 'p { margin: 0; background: green; }\n',
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await openStoredWorkspaceContextByHead(page, pHeadBranch)
  await openStoredWorkspaceContextByHead(page, ppHeadBranch)

  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('const App = () => <PP />')
  await expect(
    page.getByRole('listitem', { name: 'Workspace tab module.tsx' }),
  ).toBeVisible()

  await ensureOpenPrDrawerOpen(page)
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  const pushDrawer = page.getByRole('complementary', { name: 'Push Commit' })
  await expect(pushDrawer).toBeVisible()
  await expect(pushDrawer.getByLabel('Head')).toHaveValue(ppHeadBranch)
  await expect(pushDrawer.getByLabel('PR title')).toHaveValue('PP')

  await expect
    .poll(async () => {
      const pRecord = await getWorkspaceTabsRecord(page, { headBranch: pHeadBranch })
      const ppRecord = await getWorkspaceTabsRecord(page, { headBranch: ppHeadBranch })
      const pTabs = Array.isArray(pRecord?.tabs) ? pRecord.tabs : []
      const ppTabs = Array.isArray(ppRecord?.tabs) ? ppRecord.tabs : []

      const pComponent = pTabs.find(tab => tab?.id === 'component') as
        | { content?: unknown }
        | undefined
      const ppComponent = ppTabs.find(tab => tab?.id === 'component') as
        | { content?: unknown }
        | undefined
      const ppStyles = ppTabs.find(tab => tab?.id === 'styles') as
        | { content?: unknown; syncedContent?: unknown; isDirty?: unknown }
        | undefined
      const ppStylesContent =
        typeof ppStyles?.content === 'string' ? ppStyles.content : ''
      const ppStylesSyncedContent =
        typeof ppStyles?.syncedContent === 'string' ? ppStyles.syncedContent : null
      const ppStylesDirty = ppStyles?.isDirty === true

      return {
        pId: typeof pRecord?.id === 'string' ? pRecord.id : '',
        ppId: typeof ppRecord?.id === 'string' ? ppRecord.id : '',
        pKey:
          typeof pRecord?.workspaceKey === 'string' ? pRecord.workspaceKey.trim() : '',
        ppKey:
          typeof ppRecord?.workspaceKey === 'string' ? ppRecord.workspaceKey.trim() : '',
        pTabCount: pTabs.length,
        ppTabCount: ppTabs.length,
        pHasPContent:
          typeof pComponent?.content === 'string' && pComponent.content.includes('<P />'),
        ppHasPPContent:
          typeof ppComponent?.content === 'string' &&
          ppComponent.content.includes('<PP />'),
        ppStylesDirtyConsistent:
          ppStylesSyncedContent === null
            ? true
            : ppStylesDirty === (ppStylesContent !== ppStylesSyncedContent),
      }
    })
    .toEqual({
      pId: 'ws_45d9b895-a424-43ef-8bab-7090726f94f7',
      ppId: 'ws_d6502674-64fd-46a6-9418-596f31067779',
      pKey: 'knightedcodemonkey-develop-sandbox::feat-p',
      ppKey: 'knightedcodemonkey-develop-sandbox::feat-pp',
      pTabCount: 3,
      ppTabCount: 4,
      pHasPContent: true,
      ppHasPPContent: true,
      ppStylesDirtyConsistent: true,
    })
})

test('First switch P->PP keeps PP metadata when PR verification fails', async ({
  page,
}) => {
  const pHeadBranch = 'feat/P'
  const ppHeadBranch = 'feat/PP'

  await setupSandboxRepositoryRoutes({
    page,
    pHeadBranch,
    ppHeadBranch,
    onPullRequestRequest: async ({ route }) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Bad credentials' }),
      })
    },
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await seedSandboxActivePpContexts({ page, pHeadBranch, ppHeadBranch })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await openStoredWorkspaceContextByHead(page, pHeadBranch)
  await openStoredWorkspaceContextByHead(page, ppHeadBranch)

  await ensureOpenPrDrawerOpen(page)
  const pushDrawer = page.getByRole('complementary', { name: 'Push Commit' })
  await expect(pushDrawer).toBeVisible()

  await expect(pushDrawer.getByLabel('Head')).toHaveValue(ppHeadBranch)
  await expect(pushDrawer.getByLabel('PR title')).toHaveValue('PP')
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('const App = () => <PP />')
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Could not verify saved pull request state')
})

test('Late verify response from P does not override PP after first switch', async ({
  page,
}) => {
  const pHeadBranch = 'feat/P'
  const ppHeadBranch = 'feat/PP'

  await setupSandboxRepositoryRoutes({
    page,
    pHeadBranch,
    ppHeadBranch,
    onPullRequestRequest: async ({ pullRequestNumber, route }) => {
      if (pullRequestNumber === 69) {
        await new Promise(resolve => {
          setTimeout(resolve, 400)
        })
      }

      const headRef = pullRequestNumber === 70 ? ppHeadBranch : pHeadBranch
      const title = pullRequestNumber === 70 ? 'PP' : 'P'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: pullRequestNumber,
          state: 'open',
          title,
          html_url: `https://github.com/${sandboxRepositoryFullName}/pull/${pullRequestNumber}`,
          head: { ref: headRef },
          base: { ref: 'main' },
        }),
      })
    },
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await seedSandboxActivePpContexts({ page, pHeadBranch, ppHeadBranch })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await openStoredWorkspaceContextByHead(page, pHeadBranch)
  await openStoredWorkspaceContextByHead(page, ppHeadBranch)

  await ensureOpenPrDrawerOpen(page)
  const pushDrawer = page.getByRole('complementary', { name: 'Push Commit' })
  await expect(pushDrawer).toBeVisible()

  await expect
    .poll(async () => {
      const head = await pushDrawer.getByLabel('Head').inputValue()
      const title = await pushDrawer.getByLabel('PR title').inputValue()
      const component = await page
        .locator('.editor-panel[data-editor-kind="component"] .cm-content')
        .first()
        .innerText()

      return {
        head: typeof head === 'string' ? head.trim() : '',
        title: typeof title === 'string' ? title.trim() : '',
        hasPpComponent: component.includes('<PP />'),
      }
    })
    .toEqual({
      head: ppHeadBranch,
      title: 'PP',
      hasPpComponent: true,
    })
})

test('Late verify response from PP does not override P after switching back', async ({
  page,
}) => {
  const pHeadBranch = 'feat/P'
  const ppHeadBranch = 'feat/PP'

  await setupSandboxRepositoryRoutes({
    page,
    pHeadBranch,
    ppHeadBranch,
    onPullRequestRequest: async ({ pullRequestNumber, route }) => {
      if (pullRequestNumber === 70) {
        await new Promise(resolve => {
          setTimeout(resolve, 400)
        })
      }

      const headRef = pullRequestNumber === 70 ? ppHeadBranch : pHeadBranch
      const title = pullRequestNumber === 70 ? 'PP' : 'P'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: pullRequestNumber,
          state: 'open',
          title,
          html_url: `https://github.com/${sandboxRepositoryFullName}/pull/${pullRequestNumber}`,
          head: { ref: headRef },
          base: { ref: 'main' },
        }),
      })
    },
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await seedSandboxActivePpContexts({ page, pHeadBranch, ppHeadBranch })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await openStoredWorkspaceContextByHead(page, ppHeadBranch)
  await openStoredWorkspaceContextByHead(page, pHeadBranch)

  await ensureOpenPrDrawerOpen(page)
  const pushDrawer = page.getByRole('complementary', { name: 'Push Commit' })
  await expect(pushDrawer).toBeVisible()

  await expect
    .poll(async () => {
      const head = await pushDrawer.getByLabel('Head').inputValue()
      const title = await pushDrawer.getByLabel('PR title').inputValue()
      const component = await page
        .locator('.editor-panel[data-editor-kind="component"] .cm-content')
        .first()
        .innerText()

      return {
        head: typeof head === 'string' ? head.trim() : '',
        title: typeof title === 'string' ? title.trim() : '',
        hasPComponent: component.includes('<P />'),
      }
    })
    .toEqual({
      head: pHeadBranch,
      title: 'P',
      hasPComponent: true,
    })
})
