import { expect, test } from '@playwright/test'
import { defaultGitHubChatModel } from '../src/modules/github-api.js'
import type { ChatRequestBody, ChatRequestMessage } from './helpers/app-test-helpers.js'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  ensureAiChatDrawerOpen,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  waitForAppReady,
} from './helpers/app-test-helpers.js'

test('BYOT controls stay hidden when feature flag is disabled', async ({ page }) => {
  await waitForAppReady(page)

  const byotControls = page.getByRole('group', {
    name: 'GitHub controls',
    includeHidden: true,
  })
  await expect(byotControls).toHaveAttribute('hidden', '')
  await expect(byotControls).toBeHidden()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'AI Chat' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open PR' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Open Pull Request' })).toBeHidden()
})

test('BYOT controls render when feature flag is enabled by query param', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  const byotControls = page.getByRole('group', { name: 'GitHub controls' })
  await expect(byotControls).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open PR' })).toBeHidden()
})

test('GitHub token info panel reflects missing and present token states', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

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
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)

  const dialog = page.getByRole('dialog', {
    name: 'Remove saved GitHub token?',
    includeHidden: true,
  })
  const tokenDelete = page.getByRole('button', { name: 'Delete GitHub token' })
  const tokenAdd = page.getByRole('button', { name: 'Add GitHub token' })
  const tokenInput = page.getByRole('textbox', { name: 'GitHub token' })

  await expect(tokenDelete).toBeVisible()

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
})

test('AI chat drawer opens and closes when feature flag is enabled', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Summarize this repository.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toHaveText('Response streamed from GitHub.')
  await expect(page.getByText('Rate limit info unavailable', { exact: true })).toHaveText(
    'Rate limit info unavailable',
  )
  await expect(page.getByText('Summarize this repository.')).toBeVisible()
  await expect(page.getByText('Streaming response ready')).toBeVisible()

  expect(streamRequestBody?.metadata).toBeUndefined()
  expect(streamRequestBody?.model).toBe(defaultGitHubChatModel)
  const systemMessage = streamRequestBody?.messages?.find(
    (message: ChatRequestMessage) => message.role === 'system',
  )
  const systemMessages = streamRequestBody?.messages?.filter(
    (message: ChatRequestMessage) => message.role === 'system',
  )
  expect(systemMessage?.content).toContain('Selected repository context')
  expect(systemMessage?.content).toContain('Repository: knightedcodemonkey/develop')
  expect(systemMessage?.content).toContain(
    'Repository URL: https://github.com/knightedcodemonkey/develop',
  )
  expect(
    systemMessages?.some((message: ChatRequestMessage) =>
      message.content?.includes('Editor context:'),
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureAiChatDrawerOpen(page)

  const includeEditorsToggle = page.getByLabel('Send JSX + CSS editor context')
  await expect(includeEditorsToggle).toBeChecked()
  await includeEditorsToggle.uncheck()

  await page.getByLabel('Ask AI assistant').fill('No editor source this time.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByText('Response streamed from GitHub.', { exact: true }),
  ).toHaveText('Response streamed from GitHub.')
  await expect(page.getByText('Rate limit info unavailable', { exact: true })).toHaveText(
    'Rate limit info unavailable',
  )

  expect(streamRequestBody?.metadata).toBeUndefined()
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
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
  await expect(
    page.getByText('Remaining 17, resets 00:00 UTC', { exact: true }),
  ).toHaveText('Remaining 17, resets 00:00 UTC')
  await expect(page.getByText('Fallback response from JSON path.')).toBeVisible()
  expect(streamAttemptCount).toBeGreaterThan(0)
  expect(fallbackAttemptCount).toBeGreaterThan(0)
  expect(attemptedModels.length).toBeGreaterThan(0)
  expect(attemptedModels.every(model => model === selectedModel)).toBe(true)
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page
    .getByRole('textbox', { name: 'GitHub token' })
    .fill('github_pat_fake_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.getByLabel('Pull request repository')
  await expect(repoSelect).toBeEnabled()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'Loaded 2 writable repositories',
  )

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')

  await page.reload()
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText(
    'Loaded 2 writable repositories',
    {
      timeout: 60_000,
    },
  )
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Delete GitHub token' })).toBeVisible()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')
})
