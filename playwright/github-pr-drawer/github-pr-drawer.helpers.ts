import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
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
} from '../helpers/app-test-helpers.js'

export {
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
}
export const getOpenPrDrawer = (page: Page) =>
  page.getByRole('complementary', { name: /Open Pull Request|Push Commit/ })

export const renameWorkspaceTab = async (
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

export const clickOpenPrDrawerSubmit = async (page: Page) => {
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

export const triggerOpenPrConfirmation = async (page: Page) => {
  await clickOpenPrDrawerSubmit(page)
  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

export const submitOpenPrAndConfirm = async (
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

export const expectOpenPrConfirmationPrompt = async (page: Page) => {
  const dialog = await triggerOpenPrConfirmation(page)
  await expect(dialog).toBeVisible()
}

export const removeSavedGitHubToken = async (page: Page) => {
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

export const ensureWorkspacesDrawerOpen = async (page: Page) => {
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

export const getWorkspaceRecordId = (
  record: Record<string, unknown> | null | undefined,
) => (typeof record?.id === 'string' ? record.id : '')

export const getWorkspacesRepositoryFilterForRecord = ({
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

export const openStoredWorkspaceContextById = async (
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

  const resolveRepositoryFilterForWorkspace = async () => {
    return page.evaluate(async targetWorkspaceId => {
      const request = indexedDB.open('knighted-develop-workspaces')

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('Could not open IndexedDB.'))
      })

      try {
        const tx = db.transaction('prWorkspaces', 'readonly')
        const store = tx.objectStore('prWorkspaces')
        const getRequest = store.get(targetWorkspaceId)

        const record = await new Promise<Record<string, unknown> | null>(
          (resolve, reject) => {
            getRequest.onsuccess = () => {
              const value =
                getRequest.result && typeof getRequest.result === 'object'
                  ? (getRequest.result as Record<string, unknown>)
                  : null
              resolve(value)
            }
            getRequest.onerror = () => reject(getRequest.error)
          },
        )

        if (!record) {
          return ''
        }

        const repo = typeof record.repo === 'string' ? record.repo : ''
        const prContextState =
          typeof record.prContextState === 'string' ? record.prContextState : ''
        const prNumber =
          typeof record.prNumber === 'number' && Number.isFinite(record.prNumber)
            ? record.prNumber
            : null

        return { repo, prContextState, prNumber }
      } finally {
        db.close()
      }
    }, workspaceId)
  }

  if (typeof repositoryFilter === 'string' && repositoryFilter.trim()) {
    await selectWorkspacesRepositoryFilter(page, repositoryFilter)
  } else {
    const contextRecord = await resolveRepositoryFilterForWorkspace()
    if (contextRecord && typeof contextRecord === 'object') {
      const inferredFilter = getWorkspacesRepositoryFilterForRecord(contextRecord)
      if (inferredFilter) {
        await selectWorkspacesRepositoryFilter(page, inferredFilter)
      }
    }
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

export const openMostRecentStoredWorkspaceContext = async (page: Page) => {
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

export const selectWorkspacesRepositoryFilter = async (
  page: Page,
  repositoryFilter: string,
) => {
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

export const openStoredWorkspaceContextByHead = async (
  page: Page,
  headBranch: string,
) => {
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

export const seedLocalWorkspaceContexts = async (
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

export const toWorkspaceIdentitySegment = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export const buildWorkspaceRecordId = ({
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

export const seedActivePrWorkspaceContext = async (
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

export const getLocalContextOptionLabels = async (page: Page) => {
  return page
    .getByLabel('Stored local editor contexts')
    .locator('option')
    .evaluateAll(nodes => nodes.map(node => node.textContent?.trim() || ''))
}

export const getWorkspaceTabsRecord = async (
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

export const getAllWorkspaceRecords = async (page: Page) => {
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

export const getWorkspaceComponentContent = (record: Record<string, unknown> | null) => {
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

export const toRecordIntegritySnapshot = (record: Record<string, unknown> | null) => {
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

export const runActiveWorkspaceSwitchIntegrityScenario = async ({
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
  const usesPromotedSourceSnapshot =
    targetState === 'inactive' ||
    targetState === 'disconnected' ||
    targetState === 'closed'
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
  await openStoredWorkspaceContextById(page, activeWorkspaceId, {
    repositoryFilter: repositoryFullName,
  })

  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await openStoredWorkspaceContextById(page, targetWorkspaceId)

  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText(`Target ${targetState} content`)

  const promotedSnapshot = {
    active: {
      repo: '',
      base: '',
      head: '',
      prTitle: '',
      prNumber: null,
      prContextState: 'inactive',
      componentContent: '',
    },
    target: {
      repo: repositoryFullName,
      base: 'main',
      head: activeHeadBranch,
      prTitle: 'Active A workspace',
      prNumber: 2,
      prContextState: 'active',
      componentContent: `export const App = () => <main>Target ${targetState} content</main>`,
    },
  }
  const originalSnapshot = {
    active: {
      repo: repositoryFullName,
      base: 'main',
      head: activeHeadBranch,
      prTitle: 'Active A workspace',
      prNumber: 2,
      prContextState: 'active',
      componentContent: 'export const App = () => <main>Active A content</main>',
    },
    target: {
      repo: repositoryFullName,
      base: 'main',
      head: targetHeadBranch,
      prTitle: targetPrTitle,
      prNumber: targetPrNumber,
      prContextState: expectedTargetPrContextState,
      componentContent: `export const App = () => <main>Target ${targetState} content</main>`,
    },
  }

  const readSnapshot = async () => {
    const records = await getAllWorkspaceRecords(page)
    const activeRecord = records.find(record => record?.id === activeWorkspaceId) ?? null
    const targetRecord = records.find(record => record?.id === targetWorkspaceId) ?? null

    return {
      active: toRecordIntegritySnapshot(activeRecord as Record<string, unknown> | null),
      target: toRecordIntegritySnapshot(targetRecord as Record<string, unknown> | null),
    }
  }

  if (targetState !== 'disconnected') {
    await expect
      .poll(async () => {
        return readSnapshot()
      })
      .toEqual(usesPromotedSourceSnapshot ? promotedSnapshot : originalSnapshot)
    return
  }

  const toSnapshotKey = (value: unknown) => JSON.stringify(value)

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot()
      const snapshotKey = toSnapshotKey(snapshot)
      return (
        snapshotKey === toSnapshotKey(promotedSnapshot) ||
        snapshotKey === toSnapshotKey(originalSnapshot)
      )
    })
    .toBe(true)
}

export const runActiveWorkspaceCrossRepoSwitchIntegrityScenario = async ({
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
