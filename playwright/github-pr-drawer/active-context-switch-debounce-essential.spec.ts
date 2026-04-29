import { expect, test } from '@playwright/test'
import {
  appEntryPath,
  buildWorkspaceRecordId,
  connectByotWithSingleRepo,
  getWorkspaceTabsRecord,
  openStoredWorkspaceContextByHead,
  seedLocalWorkspaceContexts,
  setComponentEditorSource,
  toRecordIntegritySnapshot,
  waitForAppReady,
} from './github-pr-drawer.helpers.js'

const repositoryFullName = 'knightedcodemonkey/develop'

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
  const repository = 'knightedcodemonkey/develop'

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

  await connectByotWithSingleRepo(page, {
    branchesByRepo: {
      [repository]: ['main', pHeadBranch, ppHeadBranch],
    },
  })

  await openStoredWorkspaceContextByHead(page, pHeadBranch)
  await openStoredWorkspaceContextByHead(page, ppHeadBranch)

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
      }
    })
    .toEqual({
      pId: 'ws_45d9b895-a424-43ef-8bab-7090726f94f7',
      ppId: 'ws_d6502674-64fd-46a6-9418-596f31067779',
      pKey: 'knightedcodemonkey-develop::feat-p',
      ppKey: 'knightedcodemonkey-develop::feat-pp',
      pTabCount: 3,
      ppTabCount: 4,
      pHasPContent: true,
      ppHasPPContent: true,
    })
})
