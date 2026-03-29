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

const decodeGitHubFileBodyContent = (body: Record<string, unknown>) => {
  const encoded = typeof body.content === 'string' ? body.content : ''
  return Buffer.from(encoded, 'base64').toString('utf8')
}

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

test('Open PR drawer confirms and submits component/styles filepaths', async ({
  page,
}) => {
  let createdRefBody: CreateRefRequestBody | null = null
  const upsertRequests: Array<{ path: string; body: Record<string, unknown> }> = []
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
      const request = route.request()
      const method = request.method()
      const url = request.url()
      const path = new URL(url).pathname.split('/contents/')[1] ?? ''

      if (method === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      const body = request.postDataJSON() as Record<string, unknown>
      upsertRequests.push({ path: decodeURIComponent(path), body })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ commit: { sha: 'commit-sha' } }),
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('Develop/Open-Pr-Test')
  await page.getByLabel('Component filename').fill('examples/component/App.tsx')
  await page.getByLabel('Styles filename').fill('examples/styles/app.css')
  await page.getByLabel('PR title').fill('Apply editor updates from develop')
  await page
    .getByLabel('PR description')
    .fill('Generated from editor content in @knighted/develop.')

  await submitOpenPrAndConfirm(page, {
    expectedSummaryLines: [
      'Open pull request with editor content?',
      'Component file path: examples/component/App.tsx',
      'Styles file path: examples/styles/app.css',
    ],
  })

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/42',
  )

  const createdRefPayload = createdRefBody as CreateRefRequestBody | null
  const pullRequestPayload = pullRequestBody as PullRequestCreateBody | null

  expect(createdRefPayload?.ref).toBe('refs/heads/Develop/Open-Pr-Test')
  expect(createdRefPayload?.sha).toBe('abc123mainsha')

  expect(upsertRequests).toHaveLength(2)
  expect(upsertRequests[0]?.path).toBe('examples/component/App.tsx')
  expect(upsertRequests[1]?.path).toBe('examples/styles/app.css')
  expect(pullRequestPayload?.head).toBe('Develop/Open-Pr-Test')
  expect(pullRequestPayload?.base).toBe('main')

  await ensureOpenPrDrawerOpen(page)
  await expect(page.getByLabel('Component filename')).toHaveValue(
    'examples/component/App.tsx',
  )
  await expect(page.getByLabel('Styles filename')).toHaveValue('examples/styles/app.css')
  await expect(page.getByLabel('Pull request base branch')).toHaveValue('main')
  await expect(page.getByLabel('Head')).toHaveValue('Develop/Open-Pr-Test')
  await expect(page.getByLabel('PR title')).toHaveValue(
    'Apply editor updates from develop',
  )
  await expect(page.getByLabel('PR description')).toHaveValue(
    'Generated from editor content in @knighted/develop.',
  )
  await expect(
    page.getByRole('button', { name: 'Push commit to active pull request branch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close active pull request context' }),
  ).toBeVisible()
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.getByLabel('Pull request repository')
  const componentPath = page.getByLabel('Component filename')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await componentPath.fill('examples/develop/App.tsx')
  await componentPath.blur()

  await repoSelect.selectOption('knightedcodemonkey/css')
  await componentPath.fill('examples/css/App.tsx')
  await componentPath.blur()

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
  expect(activeContext.parsed?.componentFilePath).toBe('examples/css/App.tsx')
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()
  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.getByLabel('Pull request repository')
  const componentPath = page.getByLabel('Component filename')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await componentPath.fill('examples/develop/App.tsx')
  await componentPath.blur()

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
  expect(contexts[0]?.parsed?.componentFilePath).toBe('examples/develop/App.tsx')
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        componentFilePath: 'examples/component/App.tsx',
        stylesFilePath: 'examples/styles/app.css',
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        componentFilePath: 'examples/component/App.tsx',
        stylesFilePath: 'examples/styles/app.css',
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

test('Active PR context uses Push commit flow without creating a new pull request', async ({
  page,
}) => {
  const upsertRequests: Array<{ path: string; body: Record<string, unknown> }> = []
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
      const request = route.request()
      const method = request.method()
      const url = request.url()
      const path = new URL(url).pathname.split('/contents/')[1] ?? ''

      if (method === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      const body = request.postDataJSON() as Record<string, unknown>
      upsertRequests.push({ path: decodeURIComponent(path), body })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ commit: { sha: 'commit-sha' } }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        componentFilePath: 'examples/component/App.tsx',
        stylesFilePath: 'examples/styles/app.css',
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

  await setComponentEditorSource(page, 'const commitMarker = 1')
  await setStylesEditorSource(page, '.commit-marker { color: red; }')

  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    page.getByText('Push commit to active pull request branch?', { exact: true }),
  ).toHaveText('Push commit to active pull request branch?')
  await expect(
    page.getByText('Head branch: develop/open-pr-test', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Component file path: examples/component/App.tsx', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Styles file path: examples/styles/app.css', { exact: true }),
  ).toBeVisible()

  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Commit pushed to develop/open-pr-test (develop/pr/2).')

  expect(createRefRequestCount).toBe(0)
  expect(pullRequestRequestCount).toBe(0)
  expect(upsertRequests).toHaveLength(2)
  expect(upsertRequests[0]?.path).toBe('examples/component/App.tsx')
  expect(upsertRequests[1]?.path).toBe('examples/styles/app.css')
})

test('Reloaded active PR context from URL metadata keeps Push mode and status reference', async ({
  page,
}) => {
  const upsertRequests: Array<{ path: string; body: Record<string, unknown> }> = []
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
      const request = route.request()
      const method = request.method()
      const path = new URL(request.url()).pathname.split('/contents/')[1] ?? ''

      if (method === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      const body = request.postDataJSON() as Record<string, unknown>
      upsertRequests.push({ path: decodeURIComponent(path), body })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ commit: { sha: 'commit-sha' } }),
      })
    },
  )

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        componentFilePath: 'examples/component/App.tsx',
        stylesFilePath: 'examples/styles/app.css',
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

  await setComponentEditorSource(page, 'const commitMarker = 1')
  await setStylesEditorSource(page, '.commit-marker { color: red; }')

  await page.getByRole('button', { name: 'Push commit' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Push commit' }).click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Commit pushed to develop/open-pr-test (develop/pr/2).')

  expect(createRefRequestCount).toBe(0)
  expect(pullRequestRequestCount).toBe(0)
  expect(upsertRequests).toHaveLength(2)
  expect(upsertRequests[0]?.path).toBe('examples/component/App.tsx')
  expect(upsertRequests[1]?.path).toBe('examples/styles/app.css')
})

test('Reloaded active PR context syncs editor content from GitHub branch', async ({
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

      if (path === 'examples/component/App.tsx') {
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

      if (path === 'examples/styles/app.css') {
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page.evaluate(() => {
    localStorage.setItem(
      'knighted:develop:github-pr-config:knightedcodemonkey/develop',
      JSON.stringify({
        componentFilePath: 'examples/component/App.tsx',
        stylesFilePath: 'examples/styles/app.css',
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
  await expect(page.getByLabel('Render mode')).toHaveValue('react')

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

test('Open PR drawer validates unsafe filepaths', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  const componentPath = page.getByLabel('Component filename')
  await componentPath.fill('../outside/App.tsx')
  await expect(componentPath).toHaveValue('../outside/App.tsx')
  await componentPath.blur()
  await clickOpenPrDrawerSubmit(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText('Component path: File path cannot include parent directory traversal.')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('Open PR drawer allows dotted file segments that are not traversal', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  const componentPath = page.getByLabel('Component filename')
  const stylesPath = page.getByLabel('Styles filename')

  await componentPath.fill('docs/v1.0..v1.1/App.tsx')
  await stylesPath.fill('styles/foo..bar.css')
  await expect(componentPath).toHaveValue('docs/v1.0..v1.1/App.tsx')
  await expect(stylesPath).toHaveValue('styles/foo..bar.css')
  await stylesPath.blur()

  await expectOpenPrConfirmationPrompt(page)
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).not.toContainText('File path cannot include parent directory traversal.')
})

test('Open PR drawer rejects trailing slash file paths', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Component filename').fill('src/components/')
  await clickOpenPrDrawerSubmit(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Component path: File path must include a filename (no trailing slash).',
  )
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('Open PR drawer include App wrapper checkbox defaults off and resets on reopen', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  const includeWrapperToggle = page.getByLabel(
    'Include App wrapper in committed component source',
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
  const upsertRequests: Array<{ path: string; body: Record<string, unknown> }> = []

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
      const request = route.request()
      const method = request.method()
      const path =
        new URL(request.url()).pathname.split('/contents/')[1] ?? 'unknown-file-path'

      if (method === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      const body = request.postDataJSON() as Record<string, unknown>
      upsertRequests.push({ path: decodeURIComponent(path), body })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ commit: { sha: 'commit-sha' } }),
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)

  const componentSource = [
    'const CounterButton = () => <button type="button">Counter</button>',
    'const App = () => <CounterButton />',
  ].join('\n')

  await setComponentEditorSource(page, componentSource)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Head').fill('develop/repo/editor-sync-without-app')
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/101',
  )

  const componentUpserts = upsertRequests.filter(request =>
    request.path.endsWith('/App.jsx'),
  )

  expect(componentUpserts).toHaveLength(1)

  const strippedComponentSource = decodeGitHubFileBodyContent(componentUpserts[0].body)

  expect(strippedComponentSource).toContain('const CounterButton = () =>')
  expect(strippedComponentSource).not.toContain('const App = () =>')
})

test('Open PR drawer includes App wrapper in committed source when toggled on', async ({
  page,
}) => {
  const upsertRequests: Array<{ path: string; body: Record<string, unknown> }> = []

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
      const request = route.request()
      const method = request.method()
      const path =
        new URL(request.url()).pathname.split('/contents/')[1] ?? 'unknown-file-path'

      if (method === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      const body = request.postDataJSON() as Record<string, unknown>
      upsertRequests.push({ path: decodeURIComponent(path), body })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ commit: { sha: 'commit-sha' } }),
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
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
    'Include App wrapper in committed component source',
  )
  await includeWrapperToggle.check()

  await page.getByLabel('Head').fill('develop/repo/editor-sync-with-app')
  await submitOpenPrAndConfirm(page)

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Pull request opened: https://github.com/knightedcodemonkey/develop/pull/101',
  )

  const componentUpserts = upsertRequests.filter(request =>
    request.path.endsWith('/App.jsx'),
  )

  expect(componentUpserts).toHaveLength(1)

  const fullComponentSource = decodeGitHubFileBodyContent(componentUpserts[0].body)
  expect(fullComponentSource).toContain('const CounterButton = () =>')
  expect(fullComponentSource).toContain('const App = () =>')
})
