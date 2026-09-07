import { expect, test } from '@playwright/test'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  ensureWorkspacesDrawerClosed,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  setComponentEditorSource,
  waitForAppReady,
} from './helpers/app-test-helpers.js'
import {
  getAllWorkspaceRecords,
  seedLocalWorkspaceContexts,
} from './github-pr-drawer/github-pr-drawer.helpers.js'
import { selectWorkspacesRepositoryFilter } from './github-pr-drawer/github-pr-drawer.helpers.js'

test('PR/BYOT controls are visible and chat is available without a GitHub token', async ({
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
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
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

  await setComponentEditorSource(
    page,
    'export const App = () => <main>rename persists after edit</main>',
  )

  await expect
    .poll(async () => {
      const nextRecords = await getAllWorkspaceRecords(page)
      const nextRenamedRecord = nextRecords.find(
        record => record?.id === sourceWorkspaceId,
      )
      return typeof nextRenamedRecord?.prTitle === 'string'
        ? nextRenamedRecord.prTitle
        : ''
    })
    .toBe(renamedTitle)
})

test('Active Local non-PR workspace can be renamed from Workspaces drawer', async ({
  page,
}) => {
  const activeWorkspaceId = 'active_local_workspace_rename_allowed'
  const originalTitle = 'Active local rename original title'
  const renamedTitle = 'Active local rename updated title'

  await waitForAppReady(page)

  await seedLocalWorkspaceContexts(page, [
    {
      id: activeWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      head: 'feat/active-local-rename-allowed',
      prTitle: originalTitle,
      prContextState: 'inactive',
      prNumber: null,
      tabs: [
        {
          id: 'component',
          path: 'src/component.tsx',
          language: 'tsx',
          role: 'component',
          content: 'export const App = () => <main>active local rename allowed</main>',
          order: 0,
          source: 'workspace',
          dirty: false,
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page.reload()
  await waitForAppReady(page)

  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  await workspacesToggle.click()

  const workspaceSelect = page.getByLabel('Stored workspace')
  const renameButton = page.getByRole('button', { name: 'Rename', exact: true })
  await expect(renameButton).toBeVisible()

  await expect(workspaceSelect).toHaveValue(activeWorkspaceId)
  await expect(renameButton).toBeEnabled()

  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('prompt')
    expect(dialog.defaultValue()).toBe(originalTitle)
    await dialog.accept(renamedTitle)
  })

  await renameButton.click()
  await expect(page.locator('#workspaces-status')).toContainText('Renamed workspace.')

  const records = await getAllWorkspaceRecords(page)
  const renamedRecord = records.find(record => record?.id === activeWorkspaceId)

  expect(renamedRecord).toBeTruthy()
  expect(typeof renamedRecord?.prTitle === 'string' ? renamedRecord.prTitle : '').toBe(
    renamedTitle,
  )

  const selectedLabelText = await page
    .locator('#workspaces-select option:checked')
    .textContent()
  expect(String(selectedLabelText ?? '').trim()).toBe(renamedTitle)
  await expect(page.locator('#workspace-context-status')).toContainText(renamedTitle)
})

test('Active Local workspace with active PR context and null PR number cannot be renamed from Workspaces drawer', async ({
  page,
}) => {
  const activeWorkspaceId = 'active_local_workspace_rename_blocked_pr_associated'

  await waitForAppReady(page)

  await seedLocalWorkspaceContexts(page, [
    {
      id: activeWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      head: 'feat/active-local-rename-blocked',
      prTitle: 'PR-associated local workspace',
      prContextState: 'active',
      prNumber: null,
      tabs: [
        {
          id: 'component',
          path: 'src/component.tsx',
          language: 'tsx',
          role: 'component',
          content: 'export const App = () => <main>active local rename blocked</main>',
          order: 0,
          source: 'workspace',
          dirty: false,
        },
      ],
      activeTabId: 'component',
    },
  ])

  await page.reload()
  await waitForAppReady(page)

  const workspacesToggle = page.getByRole('button', {
    name: 'Workspaces',
    exact: true,
  })
  await workspacesToggle.click()

  const workspaceSelect = page.getByLabel('Stored workspace')
  const renameButton = page.getByRole('button', { name: 'Rename', exact: true })
  await expect(renameButton).toBeVisible()

  await expect(workspaceSelect).toHaveValue(activeWorkspaceId)
  await expect(renameButton).toBeDisabled()
})

test('Repository-scoped workspace cannot be renamed from Workspaces drawer', async ({
  page,
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const repositoryWorkspaceId = 'repository_workspace_rename_blocked'

  await waitForAppReady(page)

  await seedLocalWorkspaceContexts(page, [
    {
      id: repositoryWorkspaceId,
      repo: repositoryFullName,
      workspaceScope: 'repository',
      head: 'feat/repository-rename-blocked',
      prTitle: 'Repository scoped workspace',
      prContextState: 'inactive',
      prNumber: null,
      tabs: [
        {
          id: 'component',
          path: 'src/component.tsx',
          language: 'tsx',
          role: 'component',
          content: 'export const App = () => <main>repository rename blocked</main>',
          order: 0,
          source: 'workspace',
          dirty: false,
        },
      ],
      activeTabId: 'component',
    },
  ])

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

  await page.reload()
  await waitForAppReady(page)
  await connectByotWithSingleRepo(page)
  await selectWorkspacesRepositoryFilter(page, repositoryFullName)

  const workspaceSelect = page.getByLabel('Stored workspace')
  const renameButton = page.getByRole('button', { name: 'Rename', exact: true })

  await expect(workspaceSelect).toHaveValue(repositoryWorkspaceId)
  await expect(renameButton).toBeHidden()
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
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
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
