import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type {
  CreateRefRequestBody,
  PullRequestCreateBody,
} from './helpers/app-test-helpers.js'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForAppReady,
} from './helpers/app-test-helpers.js'

const getOpenPrDrawer = (page: Page) =>
  page.getByRole('complementary', { name: /Open Pull Request|Push Commit/ })

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
  await page.getByRole('button', { name: 'Delete GitHub token' }).click()

  const dialog = page.getByRole('dialog', {
    name: 'Remove saved GitHub token?',
    includeHidden: true,
  })

  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
}

const seedLocalWorkspaceContexts = async (
  page: Page,
  contexts: Array<{
    id: string
    repo: string
    head: string
    prTitle: string
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
          base: 'main',
          head: context.head,
          prTitle: context.prTitle,
          renderMode: 'dom',
          tabs: [],
          activeTabId: 'component',
          schemaVersion: 1,
          createdAt: now,
          lastModified: now,
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

const getLocalContextOptionLabels = async (page: Page) => {
  return page
    .getByLabel('Stored local editor contexts')
    .locator('option')
    .evaluateAll(nodes => nodes.map(node => node.textContent?.trim() || ''))
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

  const search = page.getByLabel('Search stored local contexts')
  await expect(search).toBeEnabled()
  await search.fill('beta')

  const labels = await getLocalContextOptionLabels(page)
  expect(labels).toEqual(['Select a stored local context', 'Local: Beta local context'])
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

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await expect(baseSelect).toHaveValue('main')
  await expect(baseSelect.getByRole('option')).toHaveText(['main', 'develop-next'])

  await repoSelect.selectOption('knightedcodemonkey/css')
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

test('Open PR drawer keeps a single active PR context in localStorage', async ({
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

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await page.getByLabel('Head').fill('examples/develop/head')
  await page.getByLabel('Head').blur()

  await repoSelect.selectOption('knightedcodemonkey/css')
  await page.getByLabel('Head').fill('examples/css/head')
  await page.getByLabel('Head').blur()

  const activeContext = await page.evaluate(() => {
    const storagePrefix = 'knighted:develop:github-pr-config:'
    const keys = Object.keys(localStorage).filter(key => key.startsWith(storagePrefix))
    const key = keys[0] ?? null
    const raw = key ? localStorage.getItem(key) : null

    let parsed = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }

    return { keys, key, parsed }
  })

  expect(activeContext.keys).toHaveLength(1)
  expect(activeContext.key).toBe(
    'knighted:develop:github-pr-config:knightedcodemonkey/css',
  )
  expect(activeContext.parsed?.headBranch).toBe('examples/css/head')
})

test('Open PR drawer does not prune saved PR context on repo switch before save', async ({
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

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await page.getByLabel('Head').fill('examples/develop/head')
  await page.getByLabel('Head').blur()

  await repoSelect.selectOption('knightedcodemonkey/css')

  const contexts = await page.evaluate(() => {
    const storagePrefix = 'knighted:develop:github-pr-config:'
    const keys = Object.keys(localStorage)
      .filter(key => key.startsWith(storagePrefix))
      .sort((left, right) => left.localeCompare(right))

    return keys.map(key => {
      const raw = localStorage.getItem(key)
      let parsed = null

      try {
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        parsed = null
      }

      return { key, parsed }
    })
  })

  expect(contexts).toHaveLength(1)
  expect(contexts[0]?.key).toBe(
    'knighted:develop:github-pr-config:knightedcodemonkey/develop',
  )
  expect(contexts[0]?.parsed?.headBranch).toBe('examples/develop/head')
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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)

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

  const savedActiveStateAfterCancel = await page.evaluate(() => {
    const raw = localStorage.getItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
    )

    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw)
      return parsed?.isActivePr === true
    } catch {
      return null
    }
  })

  expect(savedActiveStateAfterCancel).toBe(true)

  await page
    .getByRole('button', { name: 'Disconnect active pull request context' })
    .click()
  await dialog.getByRole('button', { name: 'Disconnect' }).click()

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Disconnect active pull request context' }),
  ).toBeHidden()

  const savedContextAfterDisconnect = await page.evaluate(() => {
    const raw = localStorage.getItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
    )

    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  expect(savedContextAfterDisconnect).not.toBeNull()
  expect(savedContextAfterDisconnect?.isActivePr).toBe(false)
  expect(savedContextAfterDisconnect?.pullRequestNumber).toBe(2)
  expect(closePullRequestRequestCount).toBe(0)
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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)

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

  const storedValue = await page.evaluate(() =>
    localStorage.getItem('knighted:develop:github-pr-config:knightedcodemonkey/develop'),
  )
  expect(storedValue).toBeNull()
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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeHidden()
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Saved pull request context is not open on GitHub.')

  const isActivePr = await page.evaluate(() => {
    const raw = localStorage.getItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
    )
    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw)
      return parsed?.isActivePr === true
    } catch {
      return null
    }
  })

  expect(isActivePr).toBe(false)
})

test('Active PR context rehydrates after token remove and re-add', async ({ page }) => {
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
          state: 'open',
          title: 'Saved css PR context',
          html_url: 'https://github.com/knightedcodemonkey/css/pull/7',
          head: { ref: 'css/rehydrate-test' },
          base: { ref: 'main' },
        }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}`)

  await page.evaluate(() => {
    localStorage.setItem('knighted:develop:github-repository', 'knightedcodemonkey/css')
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/css',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'css/rehydrate-test',
        prTitle: 'Saved css PR context',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 7,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/css/pull/7',
      }),
    )
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  await removeSavedGitHubToken(page)
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'GitHub token removed',
  )

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Pull request repository')).toHaveValue(
    'knightedcodemonkey/css',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()

  const selectedRepository = await page.evaluate(() =>
    localStorage.getItem('knighted:develop:github-repository'),
  )
  expect(selectedRepository).toBe('knightedcodemonkey/css')
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

  await waitForAppReady(page, `${appEntryPath}`)

  await page.evaluate(() => {
    localStorage.setItem('knighted:develop:github-repository', 'knightedcodemonkey/css')
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/css',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'css/rehydrate-test',
        prTitle: 'Saved css PR context',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 7,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/css/pull/7',
      }),
    )
  })

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
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
  ).toContainText('Saved pull request context is not open on GitHub.')

  const isActivePr = await page.evaluate(() => {
    const raw = localStorage.getItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/css',
    )
    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw)
      return parsed?.isActivePr === true
    } catch {
      return null
    }
  })

  expect(isActivePr).toBe(false)
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

  await waitForAppReady(page, `${appEntryPath}`)

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: '',
        prTitle: 'Recovered PR context title',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)

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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await expect(page.getByLabel('Pull request repository')).toBeDisabled()
  await expect(page.getByLabel('Pull request base branch')).toBeDisabled()
  await expect(page.getByLabel('Head')).toHaveJSProperty('readOnly', true)
  await expect(page.getByLabel('PR title')).toHaveJSProperty('readOnly', true)
  await expect(
    page.getByLabel('Include entry tab source in committed output'),
  ).toBeEnabled()
  await expect(page.getByLabel('Commit message')).toBeEditable()

  await expect(page.getByLabel('PR description')).toBeHidden()
  await expect(page.getByLabel('Commit message')).toBeVisible()

  const includeWrapperToggle = page.getByLabel(
    'Include entry tab source in committed output',
  )
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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)
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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)

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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        styleMode: 'sass',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)
  await expect(page.getByLabel('Render mode')).toHaveValue('react')
  await expect(page.getByLabel('Style mode')).toHaveValue('sass')

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const componentEditor = document.getElementById('jsx-editor')
        const stylesEditor = document.getElementById('css-editor')

        return {
          component:
            componentEditor instanceof HTMLTextAreaElement ? componentEditor.value : '',
          styles: stylesEditor instanceof HTMLTextAreaElement ? stylesEditor.value : '',
        }
      }),
    )
    .toEqual({
      component: remoteComponentSource,
      styles: remoteStylesSource,
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

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        syncComponentFilePath: 'src/components/App.tsx',
        syncStylesFilePath: 'src/styles/app.css',
        renderMode: 'react',
        styleMode: 'scss',
        baseBranch: 'main',
        headBranch: 'develop/open-pr-test',
        prTitle: 'Existing PR context from storage',
        prBody: 'Saved body',
        isActivePr: true,
        pullRequestUrl: 'https://github.com/knightedcodemonkey/develop/pull/2',
      }),
    )
  })

  await connectByotWithSingleRepo(page)
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

test('Open PR drawer include App wrapper checkbox defaults off and resets on reopen', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  const includeWrapperToggle = page.getByLabel(
    'Include entry tab source in committed output',
  )
  await expect(includeWrapperToggle).not.toBeChecked()

  await includeWrapperToggle.check()
  await expect(includeWrapperToggle).toBeChecked()

  await page.getByRole('button', { name: 'Close open pull request drawer' }).click()
  await ensureOpenPrDrawerOpen(page)

  await expect(includeWrapperToggle).not.toBeChecked()
})

test('Open PR drawer strips App wrapper from committed component source by default', async ({
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
  await page.getByLabel('PR title').fill('Strip App wrapper by default')
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

test('Open PR drawer includes App wrapper in committed source when toggled on', async ({
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

  const includeWrapperToggle = page.getByLabel(
    'Include entry tab source in committed output',
  )
  await includeWrapperToggle.check()

  await page.getByLabel('Head').fill('develop/repo/editor-sync-with-app')
  await page.getByLabel('PR title').fill('Include App wrapper in commit')
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
