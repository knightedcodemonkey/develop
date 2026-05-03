import { expect, test } from '@playwright/test'
import { defaultGitHubChatModel } from '../src/modules/github/api/chat.js'
import type { ChatRequestBody, ChatRequestMessage } from './helpers/app-test-helpers.js'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  ensureWorkspacesDrawerClosed,
  ensureAiChatDrawerOpen,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  openWorkspaceTab,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForAppReady,
} from './helpers/app-test-helpers.js'
import {
  getAllWorkspaceRecords,
  seedLocalWorkspaceContexts,
} from './github-pr-drawer/github-pr-drawer.helpers.js'

test('PR/BYOT controls are visible and chat stays hidden until token connect', async ({
  page,
}) => {
  await waitForAppReady(page)

  const byotControls = page.getByRole('group', { name: 'GitHub controls' })
  const prToggle = page.getByRole('button', {
    name: 'Open pull request',
    exact: true,
    includeHidden: true,
  })
  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
    includeHidden: true,
  })
  await expect(byotControls).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'AI Chat' })).toBeHidden()
  await expect(prToggle).toHaveCount(1)
  await expect(prToggle).toBeHidden()
  await expect(workspacesToggle).toHaveCount(1)
  await expect(workspacesToggle).toBeVisible()
})

test('Workspaces repository filter is local-only and read-only without PAT', async ({
  page,
}) => {
  await waitForAppReady(page)

  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  await expect(workspacesToggle).toBeVisible()

  await workspacesToggle.click()

  const repositoryFilter = page.getByRole('combobox', {
    name: 'Workspace repository filter',
  })
  await expect(repositoryFilter).toBeDisabled()
  await expect(repositoryFilter).toHaveValue('__local__')
  await expect(repositoryFilter.locator('option')).toHaveCount(1)
  await expect(repositoryFilter.locator('option')).toHaveText(['Local'])
})

test('No-PAT startup restores Local workspace from mixed stored contexts', async ({
  page,
}) => {
  const localWorkspaceId = 'local_no_pat_restore_target'
  const localHead = 'feat/local-no-pat-restore'
  const localMarker = 'Local restore marker content'
  const repositoryMarker = 'Repository restore marker content'

  await waitForAppReady(page)

  await page.evaluate(async () => {
    const request = indexedDB.open('knighted-develop-workspaces')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
    })

    try {
      const tx = db.transaction('prWorkspaces', 'readwrite')
      const store = tx.objectStore('prWorkspaces')
      const clearRequest = store.clear()

      await new Promise<void>((resolve, reject) => {
        clearRequest.onsuccess = () => resolve()
        clearRequest.onerror = () => reject(clearRequest.error)
      })

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  })

  await seedLocalWorkspaceContexts(page, [
    {
      id: localWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      base: 'main',
      head: localHead,
      prTitle: 'Local restore target',
      prContextState: 'inactive',
      prNumber: null,
      tabs: [
        {
          id: 'entry',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: `export const App = () => <main>${localMarker}</main>`,
        },
      ],
      activeTabId: 'entry',
      createdAt: Date.now() - 5000,
      lastModified: Date.now() - 5000,
    },
    {
      id: 'repo_no_pat_restore_should_not_apply',
      repo: 'knightedcodemonkey/develop',
      workspaceScope: 'repository',
      base: 'main',
      head: 'feat/repo-should-not-restore-without-pat',
      prTitle: 'Repository active context',
      prContextState: 'active',
      prNumber: 107,
      tabs: [
        {
          id: 'entry',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: `export const App = () => <main>${repositoryMarker}</main>`,
        },
      ],
      activeTabId: 'entry',
      createdAt: Date.now() + 5000,
      lastModified: Date.now() + 5000,
    },
  ])

  await page.reload()
  await waitForAppReady(page)

  await expect(page.locator('#github-pr-head-branch')).toHaveValue(localHead)
  await expect(
    page.getByRole('textbox', { name: 'Component source editor' }),
  ).toContainText(localMarker)
  await expect(
    page.getByRole('textbox', { name: 'Component source editor' }),
  ).not.toContainText(repositoryMarker)

  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  await workspacesToggle.click()

  await expect(page.locator('#workspaces-repository')).toBeDisabled()
  await expect(page.locator('#workspaces-select')).toHaveValue(localWorkspaceId)
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled()
})

test('PAT connect after Local-only session preserves Local records and enables repository workflows', async ({
  page,
}) => {
  const localWorkspaceId = 'local_pat_connect_preserve'
  const localHead = 'feat/local-before-pat-connect'

  await waitForAppReady(page)

  await page.evaluate(async () => {
    const request = indexedDB.open('knighted-develop-workspaces')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
    })

    try {
      const tx = db.transaction('prWorkspaces', 'readwrite')
      const store = tx.objectStore('prWorkspaces')
      const clearRequest = store.clear()

      await new Promise<void>((resolve, reject) => {
        clearRequest.onsuccess = () => resolve()
        clearRequest.onerror = () => reject(clearRequest.error)
      })

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  })

  await seedLocalWorkspaceContexts(page, [
    {
      id: localWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      base: 'main',
      head: localHead,
      prTitle: 'Local only workspace before PAT',
      prContextState: 'inactive',
      prNumber: null,
      createdAt: Date.now() - 1000,
      lastModified: Date.now() - 1000,
    },
  ])

  await page.reload()
  await waitForAppReady(page)

  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  await workspacesToggle.click()

  const repositoryFilter = page.getByLabel('Workspace repository filter')
  await expect(repositoryFilter).toBeDisabled()
  await expect(repositoryFilter).toHaveValue('__local__')
  await expect(page.locator('#workspaces-select')).toHaveValue(localWorkspaceId)

  await ensureWorkspacesDrawerClosed(page)

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

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_transition_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()

  await workspacesToggle.click()
  await expect(repositoryFilter).toBeEnabled()
  await expect(repositoryFilter.locator('option')).toHaveCount(2)
  await expect(repositoryFilter.locator('option')).toHaveText([
    'Local',
    'knightedcodemonkey/develop',
  ])

  await repositoryFilter.selectOption('knightedcodemonkey/develop')
  await expect(repositoryFilter).toHaveValue('knightedcodemonkey/develop')

  const records = await getAllWorkspaceRecords(page)
  const localRecord = records.find(record => record?.id === localWorkspaceId)

  expect(localRecord).toBeTruthy()
  expect(typeof localRecord?.repo === 'string' ? localRecord.repo : '').toBe('')
  expect(
    typeof localRecord?.workspaceScope === 'string' ? localRecord.workspaceScope : '',
  ).toBe('local')
})

test('chat becomes available after token connect', async ({ page }) => {
  await waitForAppReady(page)
  await connectByotWithSingleRepo(page)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Workspaces' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
})

test('workspace context status stays visible without PAT and after PAT connect', async ({
  page,
}) => {
  await waitForAppReady(page)

  const workspaceContextStatus = page.locator('#workspace-context-status')
  await expect(workspaceContextStatus).toBeVisible()
  await expect(workspaceContextStatus).toContainText('local')

  await connectByotWithSingleRepo(page)
  await expect(workspaceContextStatus).toBeVisible()
})

test('Local workspace can be renamed from Workspaces drawer', async ({ page }) => {
  const sourceWorkspaceId = 'local_workspace_rename_source'
  const targetWorkspaceId = 'local_workspace_rename_target'
  const originalTitle = 'Local rename original title'
  const renamedTitle = 'Local rename updated title'

  await waitForAppReady(page)

  await seedLocalWorkspaceContexts(page, [
    {
      id: sourceWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      head: 'feat/local-rename-source',
      prTitle: originalTitle,
      prContextState: 'inactive',
      tabs: [
        {
          id: 'component',
          path: 'src/component.tsx',
          language: 'tsx',
          role: 'component',
          content: 'export const App = () => <main>rename source</main>',
          order: 0,
          source: 'workspace',
          dirty: false,
        },
      ],
      activeTabId: 'component',
    },
    {
      id: targetWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      head: 'feat/local-rename-target',
      prTitle: 'Local rename target title',
      prContextState: 'inactive',
      tabs: [
        {
          id: 'component',
          path: 'src/component.tsx',
          language: 'tsx',
          role: 'component',
          content: 'export const App = () => <main>rename target</main>',
          order: 0,
          source: 'workspace',
          dirty: false,
        },
      ],
      activeTabId: 'component',
    },
  ])

  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  await workspacesToggle.click()

  const workspaceSelect = page.getByLabel('Stored workspace')
  const renameButton = page.getByRole('button', { name: 'Rename', exact: true })

  await workspaceSelect.selectOption(sourceWorkspaceId)
  await expect(workspaceSelect).toHaveValue(sourceWorkspaceId)
  await expect(renameButton).toBeEnabled()

  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('prompt')
    expect(dialog.defaultValue()).toBe(originalTitle)
    await dialog.accept(renamedTitle)
  })

  await renameButton.click()
  await expect(page.locator('#workspaces-status')).toContainText('Renamed workspace.')

  const records = await getAllWorkspaceRecords(page)
  const renamedRecord = records.find(record => record?.id === sourceWorkspaceId)

  expect(renamedRecord).toBeTruthy()
  expect(typeof renamedRecord?.prTitle === 'string' ? renamedRecord.prTitle : '').toBe(
    renamedTitle,
  )
})

test('BYOT controls render with default app entry', async ({ page }) => {
  await waitForAppReady(page, appEntryPath)

  const byotControls = page.getByRole('group', { name: 'GitHub controls' })
  const prToggle = page.getByRole('button', {
    name: 'Open pull request',
    exact: true,
    includeHidden: true,
  })
  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
    includeHidden: true,
  })
  await expect(byotControls).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeHidden()
  await expect(prToggle).toHaveCount(1)
  await expect(prToggle).toBeHidden()
  await expect(workspacesToggle).toHaveCount(1)
  await expect(workspacesToggle).toBeVisible()
})

test('GitHub token info panel reflects missing and present token states', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)

  const infoButtonMissing = page.getByRole('button', {
    name: 'About GitHub token features and privacy',
  })
  const infoButtonPresent = page.getByRole('button', {
    name: 'About GitHub token privacy',
  })
  const missingMessage = page.getByText('Provide a GitHub PAT', { exact: false })
  const presentMessage = page.getByText(
    'This token is stored only in your browser and is sent only to GitHub APIs you invoke. Use the trash icon to remove it from storage.',
  )

  await expect(infoButtonMissing).toHaveAttribute('data-token-state', 'missing')
  await expect(infoButtonMissing).toHaveAttribute(
    'aria-label',
    'About GitHub token features and privacy',
  )
  await expect(presentMessage).toBeHidden()

  await infoButtonMissing.click()
  await expect(missingMessage).toBeVisible()
  await expect(missingMessage).toContainText('Provide a GitHub PAT')
  await expect(page.getByRole('link', { name: 'docs' })).toHaveAttribute(
    'href',
    'https://github.com/knightedcodemonkey/develop/blob/main/docs/byot.md',
  )
  await expect(presentMessage).toBeHidden()

  await connectByotWithSingleRepo(page)
  await expect(infoButtonPresent).toHaveAttribute('data-token-state', 'present')
  await expect(infoButtonPresent).toHaveAttribute(
    'aria-label',
    'About GitHub token privacy',
  )

  await infoButtonPresent.click()
  await expect(presentMessage).toBeVisible()
  await expect(presentMessage).toContainText(
    'Use the trash icon to remove it from storage.',
  )
  await expect(missingMessage).toBeHidden()
})

test('deleting saved GitHub token requires confirmation modal', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)

  const dialog = page.getByRole('dialog', {
    name: 'Remove saved GitHub token?',
    includeHidden: true,
  })
  const tokenDelete = page.getByRole('button', { name: 'Delete GitHub token' })
  const tokenAdd = page.getByRole('button', { name: 'Add GitHub token' })
  const tokenInput = page.getByRole('textbox', { name: 'GitHub token' })
  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  const repositoryFilter = page.getByRole('combobox', {
    name: 'Workspace repository filter',
  })

  await expect(tokenDelete).toBeVisible()

  await workspacesToggle.click()
  await expect(repositoryFilter).toBeEnabled()
  await repositoryFilter.selectOption('knightedcodemonkey/develop')
  await expect(repositoryFilter).toHaveValue('knightedcodemonkey/develop')

  await tokenDelete.click()
  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.getByText('Remove saved GitHub token?', { exact: true })).toHaveText(
    'Remove saved GitHub token?',
  )
  await expect(
    page.getByText(
      'This action removes the token from browser storage. You can add another token at any time.',
    ),
  ).toHaveText(
    'This action removes the token from browser storage. You can add another token at any time.',
  )
  const removeButton = dialog.getByRole('button', { name: 'Remove' })
  await expect(removeButton).toBeVisible()
  await expect(removeButton).not.toHaveAttribute('aria-label')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
  await expect(tokenDelete).toBeVisible()
  await expect(tokenAdd).toBeHidden()

  await tokenDelete.click()
  await expect(dialog).toHaveAttribute('open', '')
  await removeButton.click()
  await expect(dialog).not.toHaveAttribute('open', '')

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'GitHub token removed',
  )
  await expect(tokenAdd).toBeVisible()
  await expect(tokenDelete).toBeHidden()
  await expect(tokenInput).toHaveValue('')
  await expect(workspacesToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('complementary', { name: 'Workspaces' })).toBeHidden()

  await workspacesToggle.click()
  await expect(repositoryFilter).toBeDisabled()
  await expect(repositoryFilter).toHaveValue('__local__')
})

test('AI chat drawer opens and closes', async ({ page }) => {
  await waitForAppReady(page, appEntryPath)
  await connectByotWithSingleRepo(page)

  const chatToggle = page.getByRole('button', { name: 'Chat', exact: true })
  const chatDrawer = page.getByRole('heading', { name: 'AI Chat' })

  await expect(chatToggle).toBeVisible()
  await expect(chatToggle).toHaveAttribute('aria-expanded', 'false')

  await chatToggle.click()
  await expect(chatDrawer).toBeVisible()
  await expect(chatToggle).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('button', { name: 'Close AI chat drawer' }).click()
  await expect(chatDrawer).toBeHidden()
  await expect(chatToggle).toHaveAttribute('aria-expanded', 'false')
})

test('AI chat prefers streaming responses when available', async ({ page }) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    streamRequestBody = route.request().postDataJSON() as ChatRequestBody

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"choices":[{"delta":{"content":"Streaming "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"response ready"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Summarize this repository.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toHaveText('Response streamed from GitHub.')
  await expect(page.getByText('Summarize this repository.')).toBeVisible()
  await expect(page.getByText('Streaming response ready')).toBeVisible()

  expect(streamRequestBody?.metadata).toBeUndefined()
  expect(streamRequestBody?.model).toBe(defaultGitHubChatModel)
  expect(streamRequestBody?.tool_choice).toBe('auto')
  expect(
    streamRequestBody?.tools?.some(
      tool => tool.type === 'function' && tool.function?.name === 'propose_editor_update',
    ),
  ).toBe(true)
  expect(streamRequestBody?.messages?.[0]?.role).toBe('system')
  expect(streamRequestBody?.messages?.[0]?.content).toContain(
    'expert software development assistant focused on CSS dialects and JSX syntax',
  )
  expect(streamRequestBody?.messages?.[0]?.content).toContain(
    'JSX is compiled for @knighted/jsx DOM runtime',
  )
  expect(streamRequestBody?.messages?.[0]?.content).toContain(
    'Do not suggest React imports, hooks, or React-only runtime APIs',
  )
  expect(streamRequestBody?.messages?.[0]?.content).toContain(
    'Preserve the selected style dialect and avoid cross-dialect rewrites',
  )
  const systemMessages = streamRequestBody?.messages?.filter(
    (message: ChatRequestMessage) => message.role === 'system',
  )
  const repositorySystemMessage = systemMessages?.find((message: ChatRequestMessage) =>
    message.content?.includes('Selected repository context'),
  )
  expect(repositorySystemMessage?.content).toContain(
    'Repository: knightedcodemonkey/develop',
  )
  expect(repositorySystemMessage?.content).toContain(
    'Repository URL: https://github.com/knightedcodemonkey/develop',
  )
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Editor context:'),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some(
      (message: ChatRequestMessage) =>
        message.content?.includes('- Active tab:') &&
        message.content?.includes('App.tsx'),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Available tab targets (id and path):'),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Active tab source:'),
    ),
  ).toBe(true)
})

test('AI chat can disable editor context payload via checkbox', async ({ page }) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    streamRequestBody = route.request().postDataJSON() as ChatRequestBody

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureAiChatDrawerOpen(page)

  const includeEditorsToggle = page.getByLabel('Send tab content')
  await expect(includeEditorsToggle).toBeChecked()
  await includeEditorsToggle.uncheck()

  await page.getByLabel('Ask AI assistant').fill('No editor source this time.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toHaveText('Response streamed from GitHub.')

  expect(streamRequestBody?.metadata).toBeUndefined()
  expect(streamRequestBody?.tool_choice).toBe('none')
  const systemMessages = streamRequestBody?.messages?.filter(
    (message: ChatRequestMessage) => message.role === 'system',
  )
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Selected repository context'),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes(
        'Repository URL: https://github.com/knightedcodemonkey/develop',
      ),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Editor context:'),
    ),
  ).toBe(false)
})

test('AI chat proposals can be confirmed, applied, and undone per active tab', async ({
  page,
}) => {
  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody | null

    if (body?.stream) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'stream intentionally disabled in this test' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Prepared updates for both editors.',
              tool_calls: [
                {
                  id: 'call_component',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/components/App.tsx',
                      content: 'const App = () => <button type="button">Updated</button>',
                      rationale: 'Use explicit App component output.',
                    }),
                  },
                },
                {
                  id: 'call_styles',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/styles/app.css',
                      content: '.button { color: rgb(10 20 30); }',
                      rationale: 'Provide deterministic button styling.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await setComponentEditorSource(page, 'const App = () => <button>Before</button>')
  await setStylesEditorSource(page, '.button { color: red; }')
  await openWorkspaceTab(page, 'App.tsx')
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Suggest updates for both editors.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Prepared updates for both editors.', { exact: true }),
  ).toBeVisible()

  await expect(
    page.getByRole('button', { name: 'Apply update to App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Apply update to app.css' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Apply update to App.tsx' }).click()

  await expect(page.getByRole('button', { name: 'Apply update to App.tsx' })).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Undo last apply for App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Undo last apply for app.css' }),
  ).toBeHidden()
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Updated')

  await openWorkspaceTab(page, 'app.css')
  await expect(
    page.getByRole('button', { name: 'Undo last apply for App.tsx' }),
  ).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Apply update to app.css' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Apply update to app.css' }).click()

  await expect(
    page.locator('.editor-panel[data-editor-kind="styles"] .cm-content').first(),
  ).toContainText('rgb(10 20 30)')
  await expect(
    page.getByRole('button', { name: 'Undo last apply for app.css' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Undo last apply for App.tsx' }),
  ).toBeHidden()

  await page.getByRole('button', { name: 'Undo last apply for app.css' }).click()
  await expect(
    page.locator('.editor-panel[data-editor-kind="styles"] .cm-content').first(),
  ).toContainText('red')

  await openWorkspaceTab(page, 'App.tsx')
  await expect(
    page.getByRole('button', { name: 'Undo last apply for App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Undo last apply for app.css' }),
  ).toBeHidden()

  await page.getByRole('button', { name: 'Undo last apply for App.tsx' }).click()
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Before')
})

test('AI chat apply actions resolve dynamic tab targets', async ({ page }) => {
  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody | null

    if (body?.stream) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'stream intentionally disabled in this test' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Prepared updates for both editors.',
              tool_calls: [
                {
                  id: 'call_component',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/components/App.tsx',
                      content: 'const App = () => <button type="button">Updated</button>',
                    }),
                  },
                },
                {
                  id: 'call_styles',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/styles/app.css',
                      content: '.button { color: rgb(10 20 30); }',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await setComponentEditorSource(page, 'const App = () => <button>Before</button>')
  await setStylesEditorSource(page, '.button { color: red; }')
  await openWorkspaceTab(page, 'App.tsx')
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Suggest updates for both editors.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Prepared updates for both editors.', { exact: true }),
  ).toBeVisible()

  await expect(
    page.getByRole('button', { name: 'Apply update to App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Apply update to app.css' }),
  ).toBeVisible()

  await openWorkspaceTab(page, 'app.css')

  await expect(
    page.getByRole('button', { name: 'Apply update to App.tsx' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Apply update to app.css' }),
  ).toBeVisible()
})

test('AI chat applies the correct proposal when unresolved targets are filtered out', async ({
  page,
}) => {
  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody | null

    if (body?.stream) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'stream intentionally disabled in this test' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Prepared updates for App tab.',
              tool_calls: [
                {
                  id: 'call_unresolved',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/components/missing.tsx',
                      content: 'const Missing = () => null',
                    }),
                  },
                },
                {
                  id: 'call_component',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/components/App.tsx',
                      content: 'const App = () => <p>Resolved update</p>',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await setComponentEditorSource(page, 'const App = () => <p>Before</p>')
  await openWorkspaceTab(page, 'App.tsx')
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Update App tab only.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByRole('button', { name: 'Apply update to App.tsx' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Apply update to App.tsx' }).click()

  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Resolved update')
})

test('AI chat renders a single apply action for multiple targets resolving to the same tab', async ({
  page,
}) => {
  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody | null

    if (body?.stream) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'stream intentionally disabled in this test' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Prepared updates for App tab.',
              tool_calls: [
                {
                  id: 'call_component_id',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'component',
                      content: 'const App = () => <p>By id</p>',
                    }),
                  },
                },
                {
                  id: 'call_component_path',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/components/App.tsx',
                      content: 'const App = () => <p>By path</p>',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await setComponentEditorSource(page, 'const App = () => <p>Before</p>')
  await openWorkspaceTab(page, 'App.tsx')
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Update App tab once.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByRole('button', { name: 'Apply update to App.tsx' })).toHaveCount(
    1,
  )
})

test('AI chat sends the currently active tab when context is enabled', async ({
  page,
}) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    streamRequestBody = route.request().postDataJSON() as ChatRequestBody

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await setStylesEditorSource(page, '.button { color: red; }')
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Use active tab context only.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toHaveText('Response streamed from GitHub.')

  const systemMessages = streamRequestBody?.messages?.filter(
    (message: ChatRequestMessage) => message.role === 'system',
  )
  expect(
    systemMessages?.some(
      (message: ChatRequestMessage) =>
        message.content?.includes('- Active tab:') &&
        message.content?.includes('app.css'),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Active tab source:'),
    ),
  ).toBe(true)
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Available tab targets (id and path):'),
    ),
  ).toBe(true)
})

test('AI chat streaming text still updates while latest undo actions are visible', async ({
  page,
}) => {
  let requestCount = 0

  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    requestCount += 1
    const body = route.request().postDataJSON() as ChatRequestBody | null

    if (requestCount <= 2) {
      if (body?.stream) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'force fallback for proposal setup' }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Prepared updates for styles editor.',
                tool_calls: [
                  {
                    id: 'call_styles',
                    type: 'function',
                    function: {
                      name: 'propose_editor_update',
                      arguments: JSON.stringify({
                        target: 'src/styles/app.css',
                        content: '.button { color: rgb(10 20 30); }',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      return
    }

    if (body?.stream) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"choices":[{"delta":{"content":"Streaming "}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"works with undo visible."}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'fallback text' } }],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await setStylesEditorSource(page, '.button { color: red; }')
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Suggest a styles update.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Prepared updates for styles editor.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Apply update to app.css' }).click()
  await expect(
    page.getByRole('button', { name: 'Undo last apply for app.css' }),
  ).toBeVisible()

  await page
    .getByLabel('Ask AI assistant')
    .fill('Are you still working on that last request?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Streaming works with undo visible.')).toBeVisible()
})

test('AI chat falls back to non-streaming response when streaming fails', async ({
  page,
}) => {
  let streamAttemptCount = 0
  let fallbackAttemptCount = 0
  const attemptedModels: string[] = []

  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody | null
    if (typeof body?.model === 'string') {
      attemptedModels.push(body.model)
    }

    if (body?.stream) {
      streamAttemptCount += 1
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'stream failed' }),
      })
      return
    }

    fallbackAttemptCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rate_limit: {
          remaining: 17,
          reset: 1704067200,
        },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Fallback response from JSON path.',
            },
          },
        ],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureAiChatDrawerOpen(page)

  const selectedModel = 'openai/gpt-5-mini'
  await page.getByLabel('Chat model').selectOption(selectedModel)
  await expect(page.getByLabel('Chat model')).toHaveValue(selectedModel)

  await page.getByLabel('Ask AI assistant').fill('Use fallback path.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Fallback response loaded.', { exact: true })).toHaveText(
    'Fallback response loaded.',
  )
  await expect(page.getByText('Fallback response from JSON path.')).toBeVisible()
  expect(streamAttemptCount).toBeGreaterThan(0)
  expect(fallbackAttemptCount).toBeGreaterThan(0)
  expect(attemptedModels.length).toBeGreaterThan(0)
  expect(attemptedModels.every(model => model === selectedModel)).toBe(true)
})

test('clearing chat removes previous conversation context from new request', async ({
  page,
}) => {
  const streamBodies: ChatRequestBody[] = []

  await page.route('https://models.github.ai/inference/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody
    if (body?.stream) {
      streamBodies.push(body)
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"choices":[{"delta":{"content":"ok"}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }),
    })
  })

  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('First conversation prompt')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText('Chat cleared.', { exact: true })).toBeVisible()

  await page.getByLabel('Ask AI assistant').fill('Second conversation prompt')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toBeVisible()

  expect(streamBodies.length).toBeGreaterThanOrEqual(2)
  const latestMessages = streamBodies[streamBodies.length - 1]?.messages ?? []
  const allLatestContent = latestMessages.map(message => message.content ?? '').join('\n')

  expect(allLatestContent).toContain('Second conversation prompt')
  expect(allLatestContent).not.toContain('First conversation prompt')
})

test('BYOT remembers selected repository across reloads', async ({ page }) => {
  test.setTimeout(90_000)

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
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    'knightedcodemonkey/develop': ['main', 'release'],
    'knightedcodemonkey/css': ['main', 'release/1.x'],
  })

  await waitForAppReady(page, `${appEntryPath}`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  const repoSelect = page.getByLabel('Pull request repository')
  await expect(repoSelect).toBeDisabled()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'Loaded 2 writable repositories',
  )

  await page.getByRole('button', { name: 'Workspaces' }).click()
  const workspaceRepositoryFilter = page.getByLabel('Workspace repository filter')
  const initializeButton = page.getByRole('button', {
    name: 'Initialize',
    exact: true,
  })
  await expect(workspaceRepositoryFilter).toBeVisible()
  await workspaceRepositoryFilter.selectOption('knightedcodemonkey/develop')
  await expect(workspaceRepositoryFilter).toHaveValue('knightedcodemonkey/develop')

  await expect(initializeButton).toBeVisible()
  await initializeButton.click()

  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')

  await page.reload()
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    /Loaded 2 writable repositories|Rendered/,
    {
      timeout: 60_000,
    },
  )
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Delete GitHub token' })).toBeVisible()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')
  await expect(repoSelect).toBeDisabled()
})
