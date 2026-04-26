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
  ensureWorkspacesDrawerClosed,
  mockRepositoryBranches,
  resetWorkbenchStorage,
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
  const closePrButton = page.getByRole('button', {
    name: 'Close open pull request drawer',
  })
  if (await closePrButton.isVisible()) {
    await closePrButton.evaluate(element => {
      if (element instanceof HTMLButtonElement) {
        element.click()
      }
    })
  }

  await page.getByRole('button', { name: 'Delete GitHub token' }).evaluate(element => {
    if (element instanceof HTMLButtonElement) {
      element.click()
    }
  })

  const dialog = page.getByRole('dialog', {
    name: 'Remove saved GitHub token?',
    includeHidden: true,
  })

  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
}

const ensureWorkspacesDrawerOpen = async (page: Page) => {
  const select = page.getByLabel('Stored local editor contexts')

  if (await select.isVisible()) {
    return
  }

  const closePrButton = page.getByRole('button', {
    name: 'Close open pull request drawer',
  })
  if (await closePrButton.isVisible()) {
    await closePrButton.click()
  }

  await page.getByRole('button', { name: 'Workspaces' }).click()
  await expect(select).toBeVisible()
}

const getWorkspaceRecordId = (record: Record<string, unknown> | null | undefined) =>
  typeof record?.id === 'string' ? record.id : ''

const getWorkspacesRepositoryFilterForRecord = ({
  repo,
  prContextState,
  prNumber,
}: {
  repo?: unknown
  prContextState?: unknown
  prNumber?: unknown
}) => {
  const normalizedRepo = typeof repo === 'string' ? repo.trim() : ''
  const normalizedState =
    typeof prContextState === 'string' ? prContextState.trim().toLowerCase() : ''
  const hasPrNumber = typeof prNumber === 'number' && Number.isFinite(prNumber)

  if (!normalizedRepo) {
    return '__local__'
  }

  if (normalizedState === 'inactive' && !hasPrNumber) {
    return '__local__'
  }

  return normalizedRepo
}

const openStoredWorkspaceContextById = async (
  page: Page,
  workspaceId: string,
  {
    repositoryFilter,
  }: {
    repositoryFilter?: string
  } = {},
) => {
  const select = page.getByLabel('Stored local editor contexts')
  const openButton = page.locator('#workspaces-open')

  if (typeof repositoryFilter === 'string' && repositoryFilter.trim()) {
    await selectWorkspacesRepositoryFilter(page, repositoryFilter)
  }

  await ensureWorkspacesDrawerOpen(page)

  await expect
    .poll(async () => {
      const options = await select.locator('option').all()
      for (const option of options) {
        if ((await option.getAttribute('value')) === workspaceId) {
          return true
        }
      }

      return false
    })
    .toBe(true)

  await select.selectOption(workspaceId)
  await expect(select).toHaveValue(workspaceId)
  await expect(openButton).toBeEnabled()
  await openButton.click()
  await ensureWorkspacesDrawerClosed(page)
}

const openMostRecentStoredWorkspaceContext = async (page: Page) => {
  const mostRecentContext = await page.evaluate(async () => {
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

      const byLastModified = (
        left: Record<string, unknown>,
        right: Record<string, unknown>,
      ) => {
        const leftModified =
          typeof left?.lastModified === 'number' && Number.isFinite(left.lastModified)
            ? left.lastModified
            : 0
        const rightModified =
          typeof right?.lastModified === 'number' && Number.isFinite(right.lastModified)
            ? right.lastModified
            : 0
        return rightModified - leftModified
      }

      const sortedAll = records.slice().sort(byLastModified)
      const mostRecent = sortedAll[0]
      const id = typeof mostRecent?.id === 'string' ? mostRecent.id : ''
      const repo = typeof mostRecent?.repo === 'string' ? mostRecent.repo : ''
      const prContextState =
        typeof mostRecent?.prContextState === 'string' ? mostRecent.prContextState : ''
      const prNumber =
        typeof mostRecent?.prNumber === 'number' && Number.isFinite(mostRecent.prNumber)
          ? mostRecent.prNumber
          : null
      return { id, repo, prContextState, prNumber }
    } finally {
      db.close()
    }
  })

  expect(mostRecentContext?.id).not.toBe('')
  const repositoryFilter = getWorkspacesRepositoryFilterForRecord(mostRecentContext)
  await openStoredWorkspaceContextById(page, mostRecentContext.id, {
    repositoryFilter,
  })
}

const selectWorkspacesRepositoryFilter = async (page: Page, repositoryFilter: string) => {
  const workspacesToggle = page.getByRole('button', { name: 'Workspaces' })
  const repositorySelect = page.getByLabel('Workspace repository filter')

  if (!(await repositorySelect.isVisible())) {
    const closePrButton = page.getByRole('button', {
      name: 'Close open pull request drawer',
    })
    if (await closePrButton.isVisible()) {
      await closePrButton.click()
    }

    await expect(workspacesToggle).toBeVisible()
    await workspacesToggle.click()
    await expect(repositorySelect).toBeVisible()
  }

  await expect
    .poll(async () => {
      await repositorySelect.evaluate((element, value) => {
        if (!(element instanceof HTMLSelectElement)) {
          return ''
        }

        element.value = value
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return element.value
      }, repositoryFilter)

      return repositorySelect.inputValue()
    })
    .toBe(repositoryFilter)
}

const openStoredWorkspaceContextByHead = async (page: Page, headBranch: string) => {
  const workspace = await page.evaluate(async inputHeadBranch => {
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

      const normalizedHeadBranch =
        typeof inputHeadBranch === 'string' ? inputHeadBranch.trim().toLowerCase() : ''
      const matched = records.find(record => {
        const recordHead =
          typeof record?.head === 'string' ? record.head.trim().toLowerCase() : ''
        return recordHead === normalizedHeadBranch
      })

      const id = typeof matched?.id === 'string' ? matched.id : ''
      const repo = typeof matched?.repo === 'string' ? matched.repo : ''
      const prContextState =
        typeof matched?.prContextState === 'string' ? matched.prContextState : ''
      const prNumber =
        typeof matched?.prNumber === 'number' && Number.isFinite(matched.prNumber)
          ? matched.prNumber
          : null
      return { id, repo, prContextState, prNumber }
    } finally {
      db.close()
    }
  }, headBranch)

  expect(workspace?.id).not.toBe('')

  const repositoryFilter = getWorkspacesRepositoryFilterForRecord(workspace)

  await openStoredWorkspaceContextById(page, workspace.id, { repositoryFilter })
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

const getWorkspaceComponentContent = (record: Record<string, unknown> | null) => {
  if (!record || typeof record !== 'object') {
    return ''
  }

  const tabs = Array.isArray(record.tabs) ? record.tabs : []
  const componentTab = tabs.find(tab => {
    if (!tab || typeof tab !== 'object') {
      return false
    }

    return (tab as { id?: unknown }).id === 'component'
  }) as { content?: unknown } | undefined

  return typeof componentTab?.content === 'string' ? componentTab.content : ''
}

const toRecordIntegritySnapshot = (record: Record<string, unknown> | null) => {
  return {
    repo: typeof record?.repo === 'string' ? record.repo : '',
    base: typeof record?.base === 'string' ? record.base : '',
    head: typeof record?.head === 'string' ? record.head : '',
    prTitle: typeof record?.prTitle === 'string' ? record.prTitle : '',
    prNumber:
      typeof record?.prNumber === 'number' && Number.isFinite(record.prNumber)
        ? record.prNumber
        : null,
    prContextState:
      typeof record?.prContextState === 'string' ? record.prContextState : 'inactive',
    componentContent: getWorkspaceComponentContent(record),
  }
}

const runActiveWorkspaceSwitchIntegrityScenario = async ({
  page,
  targetState,
}: {
  page: Page
  targetState: 'inactive' | 'disconnected' | 'closed'
}) => {
  const repositoryFullName = 'knightedcodemonkey/develop'
  const activeHeadBranch = 'develop/issue-97-active-a'
  const targetHeadBranch = `develop/issue-97-target-${targetState}`
  const activeWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: activeHeadBranch,
  })
  const targetWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName,
    headBranch: targetHeadBranch,
  })
  const targetPrTitle =
    targetState === 'inactive' ? '' : `Target ${targetState} workspace`
  const targetPrNumber = targetState === 'inactive' ? null : 9
  const expectedTargetPrContextState =
    targetState === 'disconnected' ? 'active' : targetState

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
    [repositoryFullName]: ['main', activeHeadBranch, targetHeadBranch],
  })

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/pulls/**',
    async route => {
      const url = route.request().url()
      const pullRequestNumberMatch = url.match(/\/pulls\/(\d+)/)
      const pullRequestNumber = pullRequestNumberMatch
        ? Number.parseInt(pullRequestNumberMatch[1] ?? '', 10)
        : 0
      const isTargetPullRequest = pullRequestNumber === 9

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: isTargetPullRequest ? 9 : 2,
          state: isTargetPullRequest && targetState === 'closed' ? 'closed' : 'open',
          title: isTargetPullRequest ? targetPrTitle : 'Active A workspace',
          html_url: `https://github.com/knightedcodemonkey/develop/pull/${isTargetPullRequest ? 9 : 2}`,
          head: { ref: isTargetPullRequest ? targetHeadBranch : activeHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/git/ref/**',
    async route => {
      const url = route.request().url()
      const isTargetHeadRef = url.includes(targetHeadBranch)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: `refs/heads/${isTargetHeadRef ? targetHeadBranch : activeHeadBranch}`,
          object: {
            type: 'commit',
            sha: isTargetHeadRef ? 'target-head-sha' : 'active-head-sha',
          },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: activeWorkspaceId,
      repo: repositoryFullName,
      base: 'main',
      head: activeHeadBranch,
      prTitle: 'Active A workspace',
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
          content: 'export const App = () => <main>Active A content</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 60_000,
      lastModified: Date.now() - 60_000,
    },
    {
      id: targetWorkspaceId,
      repo: repositoryFullName,
      base: 'main',
      head: targetHeadBranch,
      prTitle: targetPrTitle,
      prNumber: targetPrNumber,
      prContextState: targetState,
      renderMode: 'dom',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: `export const App = () => <main>Target ${targetState} content</main>`,
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 120_000,
      lastModified: Date.now() - 120_000,
    },
  ])

  await connectByotWithSingleRepo(page, {
    branchesByRepo: {
      [repositoryFullName]: ['main', activeHeadBranch, targetHeadBranch],
    },
  })
  await openMostRecentStoredWorkspaceContext(page)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await openStoredWorkspaceContextById(page, targetWorkspaceId)

  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText(`Target ${targetState} content`)

  await expect
    .poll(async () => {
      const activeRecord = await getWorkspaceTabsRecord(page, {
        headBranch: activeHeadBranch,
      })
      return toRecordIntegritySnapshot(activeRecord as Record<string, unknown> | null)
    })
    .toEqual({
      repo: repositoryFullName,
      base: 'main',
      head: activeHeadBranch,
      prTitle: 'Active A workspace',
      prNumber: 2,
      prContextState: 'active',
      componentContent: 'export const App = () => <main>Active A content</main>',
    })

  await expect
    .poll(async () => {
      const targetRecord = await getWorkspaceTabsRecord(page, {
        headBranch: targetHeadBranch,
      })
      return toRecordIntegritySnapshot(targetRecord as Record<string, unknown> | null)
    })
    .toEqual({
      repo: repositoryFullName,
      base: 'main',
      head: targetHeadBranch,
      prTitle: targetPrTitle,
      prNumber: targetPrNumber,
      prContextState: expectedTargetPrContextState,
      componentContent: `export const App = () => <main>Target ${targetState} content</main>`,
    })

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const activeRecord = records.find(record => record?.head === activeHeadBranch)
      const targetRecord = records.find(record => record?.head === targetHeadBranch)
      return Boolean(activeRecord) && Boolean(targetRecord)
    })
    .toBe(true)
}

const runActiveWorkspaceCrossRepoSwitchIntegrityScenario = async ({
  page,
  targetState,
}: {
  page: Page
  targetState: 'inactive' | 'disconnected' | 'closed'
}) => {
  const sourceRepositoryFullName = 'knightedcodemonkey/develop'
  const targetRepositoryFullName = 'knightedcodemonkey/css'
  const sourceHeadBranch = 'develop/issue-97-cross-source-active'
  const targetHeadBranch = `css/issue-97-cross-target-${targetState}`
  const sourceWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: sourceRepositoryFullName,
    headBranch: sourceHeadBranch,
  })
  const targetWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: targetRepositoryFullName,
    headBranch: targetHeadBranch,
  })
  const targetPrTitle =
    targetState === 'inactive' ? '' : `Cross target ${targetState} workspace`
  const targetPrNumber = 9
  const expectedTargetPrContextState =
    targetState === 'disconnected' ? 'active' : targetState

  await page.route('https://api.github.com/user/repos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          owner: { login: 'knightedcodemonkey' },
          name: 'develop',
          full_name: sourceRepositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
        {
          id: 12,
          owner: { login: 'knightedcodemonkey' },
          name: 'css',
          full_name: targetRepositoryFullName,
          default_branch: 'main',
          permissions: { push: true },
        },
      ]),
    })
  })

  await mockRepositoryBranches(page, {
    [sourceRepositoryFullName]: ['main', sourceHeadBranch],
    [targetRepositoryFullName]: ['main', targetHeadBranch],
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
          title: 'Cross source active workspace',
          html_url: 'https://github.com/knightedcodemonkey/develop/pull/2',
          head: { ref: sourceHeadBranch },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/css/pulls/9',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 9,
          state: targetState === 'closed' ? 'closed' : 'open',
          title: targetPrTitle,
          html_url: 'https://github.com/knightedcodemonkey/css/pull/9',
          head: { ref: targetHeadBranch },
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
          ref: `refs/heads/${sourceHeadBranch}`,
          object: { type: 'commit', sha: 'cross-source-head-sha' },
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
          ref: `refs/heads/${targetHeadBranch}`,
          object: { type: 'commit', sha: 'cross-target-head-sha' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await seedLocalWorkspaceContexts(page, [
    {
      id: sourceWorkspaceId,
      repo: sourceRepositoryFullName,
      base: 'main',
      head: sourceHeadBranch,
      prTitle: 'Cross source active workspace',
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
          content: 'export const App = () => <main>Cross source active content</main>',
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 60_000,
      lastModified: Date.now() - 60_000,
    },
    {
      id: targetWorkspaceId,
      repo: targetRepositoryFullName,
      base: 'main',
      head: targetHeadBranch,
      prTitle: targetPrTitle,
      prNumber: targetPrNumber,
      prContextState: targetState,
      renderMode: 'dom',
      tabs: [
        {
          id: 'component',
          name: 'App.tsx',
          path: 'src/components/App.tsx',
          language: 'javascript-jsx',
          role: 'entry',
          isActive: true,
          content: `export const App = () => <main>Cross target ${targetState} content</main>`,
        },
      ],
      activeTabId: 'component',
      createdAt: Date.now() - 120_000,
      lastModified: Date.now() - 120_000,
    },
  ])

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await selectWorkspacesRepositoryFilter(page, sourceRepositoryFullName)

  await openStoredWorkspaceContextByHead(page, sourceHeadBranch)

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await openStoredWorkspaceContextByHead(page, targetHeadBranch)

  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText(`Cross target ${targetState} content`)

  await expect
    .poll(async () => {
      const sourceRecord = await getWorkspaceTabsRecord(page, {
        headBranch: sourceHeadBranch,
      })
      return toRecordIntegritySnapshot(sourceRecord as Record<string, unknown> | null)
    })
    .toEqual({
      repo: sourceRepositoryFullName,
      base: 'main',
      head: sourceHeadBranch,
      prTitle: 'Cross source active workspace',
      prNumber: 2,
      prContextState: 'active',
      componentContent:
        'export const App = () => <main>Cross source active content</main>',
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
      prTitle: targetPrTitle,
      prNumber: targetPrNumber,
      prContextState: expectedTargetPrContextState,
      componentContent: `export const App = () => <main>Cross target ${targetState} content</main>`,
    })

  await expect
    .poll(async () => {
      const records = await getAllWorkspaceRecords(page)
      const sourceRecord = records.find(
        record =>
          record?.repo === sourceRepositoryFullName && record?.head === sourceHeadBranch,
      )
      const targetRecord = records.find(
        record =>
          record?.repo === targetRepositoryFullName && record?.head === targetHeadBranch,
      )
      return Boolean(sourceRecord) && Boolean(targetRecord)
    })
    .toBe(true)
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

test('Switching Workspaces repository scope to Local clears repo on active inactive workspace record', async ({
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
      const record = await getWorkspaceTabsRecord(page, {
        headBranch,
      })

      return typeof record?.repo === 'string' ? record.repo : null
    })
    .toBe('')

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

test('Open PR keeps inactive workspace record when repository changes', async ({
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

  const expectedWorkspaceId = buildWorkspaceRecordId({
    repositoryFullName: newRepository,
    headBranch,
  })

  const promotedActiveRecord = recordsByHead.find(
    record => record?.repo === newRepository && record?.prContextState === 'active',
  )

  expect(promotedActiveRecord?.id).toBe(expectedWorkspaceId)
  expect(promotedActiveRecord?.prNumber).toBe(88)

  const preservedSourceRecord = recordsByHead.find(
    record => record?.repo === oldRepository && record?.prContextState === 'inactive',
  )
  expect(Boolean(preservedSourceRecord)).toBe(true)
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
    page.getByRole('button', { name: 'Open pull request', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()
  await expect(page.getByLabel('Head')).toHaveValue(staleLocalHeadBranch)

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
    page.getByRole('button', { name: 'Open pull request', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()

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
    page.getByRole('button', { name: 'Open pull request', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()

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
