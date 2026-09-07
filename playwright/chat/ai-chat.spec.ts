import { expect, test } from '@playwright/test'
import { defaultChatModel } from '../../src/modules/chat/api/completions.js'
import type { ChatRequestBody, ChatRequestMessage } from '../helpers/app-test-helpers.js'
import {
  appEntryPath,
  connectByotWithSingleRepo,
  connectOpenRouterKey,
  ensureWorkspacesDrawerClosed,
  openRouterTestKey,
  openWorkspaceTab,
  setComponentEditorSource,
  setStylesEditorSource,
  waitForAppReady,
} from '../helpers/app-test-helpers.js'
import {
  openStoredWorkspaceContextById,
  seedLocalWorkspaceContexts,
} from '../github-pr-drawer/github-pr-drawer.helpers.js'

test('chat drawer prompts for an OpenRouter key and gates the composer', async ({
  page,
}) => {
  await waitForAppReady(page)

  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'AI Chat' })).toBeVisible()

  const keyInput = page.getByLabel('OpenRouter API key', { exact: true })
  await expect(keyInput).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save OpenRouter API key' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Remove OpenRouter API key' }),
  ).toBeHidden()

  await expect(page.getByLabel('Ask AI assistant')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()
  await expect(page.getByLabel('Chat model')).toBeDisabled()

  await connectOpenRouterKey(page)

  await expect(page.getByLabel('Ask AI assistant')).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
  await expect(page.getByLabel('Chat model')).toBeEnabled()
})

test('GitHub token is never sent to OpenRouter and the chat key is never sent to GitHub', async ({
  page,
}) => {
  const openRouterAuthHeaders: string[] = []
  const githubAuthHeaders: string[] = []

  page.on('request', request => {
    const auth = request.headers().authorization ?? ''
    if (!auth) {
      return
    }

    if (request.url().includes('openrouter.ai')) {
      openRouterAuthHeaders.push(auth)
    }

    if (request.url().includes('api.github.com')) {
      githubAuthHeaders.push(auth)
    }
  })

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }),
    })
  })

  await waitForAppReady(page)
  await connectByotWithSingleRepo(page)
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('hello')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('ok', { exact: true })).toBeVisible()

  expect(openRouterAuthHeaders.length).toBeGreaterThan(0)
  expect(githubAuthHeaders.length).toBeGreaterThan(0)
  expect(openRouterAuthHeaders.every(header => header.includes(openRouterTestKey))).toBe(
    true,
  )
  expect(openRouterAuthHeaders.some(header => header.includes('github_pat'))).toBe(false)
  expect(githubAuthHeaders.some(header => header.includes(openRouterTestKey))).toBe(false)
})

test('chat stays usable after opening a Local workspace with PAT connected', async ({
  page,
}) => {
  const localWorkspaceId = 'local_chat_issue_128'
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    streamRequestBody = route.request().postDataJSON() as ChatRequestBody

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"choices":[{"delta":{"content":"Local workspace chat works"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    })
  })

  await waitForAppReady(page)

  await seedLocalWorkspaceContexts(page, [
    {
      id: localWorkspaceId,
      repo: '',
      workspaceScope: 'local',
      head: 'feat/local-chat-issue-128',
      prTitle: 'Issue 128 local workspace',
      prContextState: 'inactive',
      tabs: [
        {
          id: 'component',
          path: 'src/component.tsx',
          language: 'tsx',
          role: 'component',
          content: 'export const App = () => <main>local chat issue 128</main>',
          order: 0,
          source: 'workspace',
          dirty: false,
        },
      ],
      activeTabId: 'component',
    },
  ])

  await connectByotWithSingleRepo(page, { assertPrRepositorySelected: false })
  await openStoredWorkspaceContextById(page, localWorkspaceId, {
    repositoryFilter: '__local__',
  })
  await ensureWorkspacesDrawerClosed(page)

  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('Confirm local workspace chat context.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Local workspace chat works')).toBeVisible()
  await expect(
    page.getByText('Select a writable repository before starting chat.', { exact: true }),
  ).toHaveCount(0)

  const repositorySystemMessage = streamRequestBody?.messages?.find(
    (message: ChatRequestMessage) =>
      message.role === 'system' &&
      message.content?.includes('Selected repository context'),
  )
  expect(repositorySystemMessage?.content).toContain(
    'Repository: knightedcodemonkey/develop',
  )
})

test('AI chat prefers streaming responses when available', async ({ page }) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('Summarize this repository.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Response streamed.', { exact: true })).toHaveText(
    'Response streamed.',
  )
  await expect(page.getByText('Summarize this repository.')).toBeVisible()
  await expect(page.getByText('Streaming response ready')).toBeVisible()

  expect(streamRequestBody?.metadata).toBeUndefined()
  expect(streamRequestBody?.model).toBe(defaultChatModel)
  expect(streamRequestBody?.tool_choice).toBeUndefined()
  expect(streamRequestBody?.tools).toBeUndefined()
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

test('AI chat enables editor update tools only for explicit edit requests', async ({
  page,
}) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  await page
    .getByLabel('Ask AI assistant')
    .fill('Please update app.css to use blue text.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Response streamed.', { exact: true })).toHaveText(
    'Response streamed.',
  )

  expect(streamRequestBody?.tool_choice).toBe('auto')
  expect(
    streamRequestBody?.tools?.some(
      tool => tool.type === 'function' && tool.function?.name === 'propose_editor_update',
    ),
  ).toBe(true)
})

test('AI chat does not render apply actions for read-only visibility prompts', async ({
  page,
}) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON() as ChatRequestBody | null

    if (body?.stream) {
      streamRequestBody = body
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
              content:
                'Yes, I can see your editor content.\n\n```jsx\nconst App = () => <p>Visible</p>\n```',
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
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('Can you see my editor content?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Fallback response loaded.', { exact: true })).toHaveText(
    'Fallback response loaded.',
  )
  await expect(page.locator('button[data-action="request-apply"]')).toHaveCount(0)
  expect(streamRequestBody?.tool_choice).toBeUndefined()
  expect(streamRequestBody?.tools).toBeUndefined()
})

test('AI chat can disable editor context payload via checkbox', async ({ page }) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  const includeEditorsToggle = page.getByLabel('Send tab content')
  await expect(includeEditorsToggle).toBeChecked()
  await includeEditorsToggle.uncheck()

  await page.getByLabel('Ask AI assistant').fill('No editor source this time.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Response streamed.', { exact: true })).toHaveText(
    'Response streamed.',
  )

  expect(streamRequestBody?.metadata).toBeUndefined()
  expect(streamRequestBody?.tool_choice).toBeUndefined()
  expect(streamRequestBody?.tools).toBeUndefined()
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
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

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
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

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
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

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
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('Update App tab once.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByRole('button', { name: 'Apply update to App.tsx' })).toHaveCount(
    1,
  )
})

test('AI chat shows guidance when an editor update target cannot be matched', async ({
  page,
}) => {
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
              content: '',
              tool_calls: [
                {
                  id: 'call_unknown_target',
                  type: 'function',
                  function: {
                    name: 'propose_editor_update',
                    arguments: JSON.stringify({
                      target: 'src/does-not-exist.ts',
                      content: 'export const value = 1',
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
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('Can you still see my tab content?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(
    page.getByText(
      'Proposed editor update is ready, but I could not match its target to an open tab. Ask me to target the active tab or one of the listed tab ids or paths.',
    ),
  ).toHaveCount(1)
  await expect(page.locator('button[data-action="request-apply"]')).toHaveCount(0)
})

test('AI chat sends the currently active tab when context is enabled', async ({
  page,
}) => {
  let streamRequestBody: ChatRequestBody | undefined

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('Use active tab context only.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Response streamed.', { exact: true })).toHaveText(
    'Response streamed.',
  )

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

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

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

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  const selectedModel = 'openai/gpt-6-astra'
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

  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
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
  await connectOpenRouterKey(page)

  await page.getByLabel('Ask AI assistant').fill('First conversation prompt')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Response streamed.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText('Chat cleared.', { exact: true })).toBeVisible()

  await page.getByLabel('Ask AI assistant').fill('Second conversation prompt')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Response streamed.', { exact: true })).toBeVisible()

  expect(streamBodies.length).toBeGreaterThanOrEqual(2)
  const latestMessages = streamBodies[streamBodies.length - 1]?.messages ?? []
  const allLatestContent = latestMessages.map(message => message.content ?? '').join('\n')

  expect(allLatestContent).toContain('Second conversation prompt')
  expect(allLatestContent).not.toContain('First conversation prompt')
})
