import { expect, test } from '@playwright/test'
import type {
  CreateRefRequestBody,
  PullRequestCreateBody,
} from './helpers/app-test-helpers.js'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  waitForAppReady,
} from './helpers/app-test-helpers.js'

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

  await page.getByRole('button', { name: 'Open PR' }).last().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    page.getByText('Open pull request with editor content?', { exact: true }),
  ).toHaveText('Open pull request with editor content?')
  await expect(
    page.getByText('Component file path: examples/component/App.tsx'),
  ).toBeVisible()
  await expect(page.getByText('Styles file path: examples/styles/app.css')).toBeVisible()

  await dialog.getByRole('button', { name: 'Open PR' }).click()

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

  await expect(page.getByLabel('Head')).toHaveValue(/^develop\/develop\/editor-sync-/)
  await expect(page.getByLabel('Head')).not.toHaveValue('Develop/Open-Pr-Test')
  await expect(page.getByLabel('PR title')).toHaveValue(
    'Apply component and styles edits to knightedcodemonkey/develop',
  )
  await expect(page.getByLabel('PR description')).toHaveValue(
    [
      'This PR was created from @knighted/develop editor content.',
      '',
      '- Component source -> examples/component/App.tsx',
      '- Styles source -> examples/styles/app.css',
    ].join('\n'),
  )
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

test('Open PR drawer validates unsafe filepaths', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Component filename').fill('../outside/App.tsx')
  await page.getByRole('button', { name: 'Open PR' }).last().click()

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

  await page.getByLabel('Component filename').fill('docs/v1.0..v1.1/App.tsx')
  await page.getByLabel('Styles filename').fill('styles/foo..bar.css')
  await page.getByRole('button', { name: 'Open PR' }).last().click()

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).not.toContainText('File path cannot include parent directory traversal.')
})

test('Open PR drawer rejects trailing slash file paths', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.getByLabel('Component filename').fill('src/components/')
  await page.getByRole('button', { name: 'Open PR' }).last().click()

  await expect(
    page.getByRole('status', { name: 'Open pull request status', includeHidden: true }),
  ).toContainText(
    'Component path: File path must include a filename (no trailing slash).',
  )
  await expect(page.getByRole('dialog')).toBeHidden()
})
