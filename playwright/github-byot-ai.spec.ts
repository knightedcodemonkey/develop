import { expect, test } from '@playwright/test'
import { defaultGitHubChatModel } from '../src/modules/github/github-api.js'
import type { ChatRequestBody, ChatRequestMessage } from './helpers/app-test-helpers.js'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  ensureAiChatDrawerOpen,
  ensureOpenPrDrawerOpen,
  mockRepositoryBranches,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForAppReady,
} from './helpers/app-test-helpers.js'

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
  await expect(byotControls).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'AI Chat' })).toBeHidden()
  await expect(prToggle).toHaveCount(1)
  await expect(prToggle).toBeHidden()
})

test('chat becomes available after token connect', async ({ page }) => {
  await waitForAppReady(page)
  await connectByotWithSingleRepo(page)

  await expect(page.getByRole('button', { name: 'Open pull request' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
})

test('BYOT controls render with default app entry', async ({ page }) => {
  await waitForAppReady(page, appEntryPath)

  const byotControls = page.getByRole('group', { name: 'GitHub controls' })
  const prToggle = page.getByRole('button', {
    name: 'Open pull request',
    exact: true,
    includeHidden: true,
  })
  await expect(byotControls).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add GitHub token' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeHidden()
  await expect(prToggle).toHaveCount(1)
  await expect(prToggle).toBeHidden()
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

  const includeEditorsToggle = page.getByLabel('Send JSX + CSS editor context')
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

test('AI chat proposals can be confirmed, applied, and undone for component and styles editors', async ({
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
                      target: 'component',
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
                      target: 'styles',
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
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Suggest updates for both editors.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Prepared updates for both editors.', { exact: true }),
  ).toBeVisible()

  const assistantResponseMessage = page
    .locator('.ai-chat-message--assistant')
    .filter({ hasText: 'Prepared updates for both editors.' })
    .first()

  await expect(
    page.getByRole('button', { name: 'Apply update to both editors' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Apply update to both editors' }).click()
  await expect(
    page.getByRole('button', { name: 'Apply update to both editors' }),
  ).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Apply update to Component editor' }),
  ).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Apply update to Styles editor' }),
  ).toBeHidden()
  await expect(
    assistantResponseMessage.getByRole('button', { name: 'Undo last Component apply' }),
  ).toHaveCount(0)
  await expect(
    assistantResponseMessage.getByRole('button', { name: 'Undo last Styles apply' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Undo last Component apply' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo last Styles apply' })).toBeVisible()
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Updated')
  await expect(
    page.locator('.editor-panel[data-editor-kind="styles"] .cm-content').first(),
  ).toContainText('rgb(10 20 30)')

  await page.getByRole('button', { name: 'Undo last Component apply' }).click()
  await expect(
    page.locator('.editor-panel[data-editor-kind="component"] .cm-content').first(),
  ).toContainText('Before')

  await page.getByRole('button', { name: 'Undo last Styles apply' }).click()
  await expect(
    page.locator('.editor-panel[data-editor-kind="styles"] .cm-content').first(),
  ).toContainText('red')
})

test('AI chat shows a single apply action when both editor proposals are available', async ({
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
                      target: 'component',
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
                      target: 'styles',
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
  await ensureAiChatDrawerOpen(page)

  await page.getByLabel('Ask AI assistant').fill('Suggest updates for both editors.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText('Prepared updates for both editors.', { exact: true }),
  ).toBeVisible()

  await expect(
    page.getByRole('button', { name: 'Apply update to both editors' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Apply update to Component editor' }),
  ).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Apply update to Styles editor' }),
  ).toBeHidden()
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
                        target: 'styles',
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
  await page.getByRole('button', { name: 'Apply update to Styles editor' }).click()
  await expect(page.getByRole('button', { name: 'Undo last Styles apply' })).toBeVisible()

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
