import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaultGitHubChatModel } from '../src/modules/github-api.js'

const webServerMode = process.env.PLAYWRIGHT_WEB_SERVER_MODE ?? 'dev'
const appEntryPath = webServerMode === 'preview' ? '/index.html' : '/src/index.html'

type ChatRequestMessage = {
  role?: string
  content?: string
}

type ChatRequestBody = {
  metadata?: unknown
  messages?: ChatRequestMessage[]
  model?: string
  stream?: boolean
}

type CreateRefRequestBody = {
  ref?: string
  sha?: string
}

type PullRequestCreateBody = {
  head?: string
  base?: string
}

const waitForAppReady = async (page: Page, path = appEntryPath) => {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect(page.locator('#cdn-loading')).toHaveAttribute('hidden', '')
  await expect.poll(() => page.locator('#status').textContent()).not.toBe('Idle')
}

const waitForInitialRender = async (page: Page) => {
  await waitForAppReady(page)
  await expect(page.locator('#status')).toHaveText('Rendered')
}

const expectPreviewHasRenderedContent = async (page: Page) => {
  const previewHost = page.locator('#preview-host')
  await expect(previewHost.locator('pre')).toHaveCount(0)
  await expect
    .poll(() => previewHost.evaluate(node => node.childElementCount))
    .toBeGreaterThan(0)
}

const setComponentEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.component-panel .cm-content').first()
  await editorContent.fill(source)
}

const setStylesEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.styles-panel .cm-content').first()
  await editorContent.fill(source)
}

const getActiveComponentEditorLineNumber = async (page: Page) => {
  return page
    .locator('#component-panel .cm-activeLineGutter')
    .first()
    .innerText()
    .then(text => text.trim())
}

const runTypecheck = async (page: Page) => {
  await ensurePanelToolsVisible(page, 'component')
  await page.locator('#typecheck-button').click()
}

const runComponentLint = async (page: Page) => {
  await ensurePanelToolsVisible(page, 'component')
  await page.locator('#lint-component-button').click()
}

const runStylesLint = async (page: Page) => {
  await ensurePanelToolsVisible(page, 'styles')
  await page.locator('#lint-styles-button').click()
}

const getActiveStylesEditorLineNumber = async (page: Page) => {
  return page
    .locator('#styles-panel .cm-activeLineGutter')
    .first()
    .innerText()
    .then(text => text.trim())
}

const getCollapseButton = (page: Page, panelName: 'component' | 'styles' | 'preview') =>
  page.locator(`#collapse-${panelName}`)

const getToolsButton = (page: Page, panelName: 'component' | 'styles') =>
  page.locator(`#tools-${panelName}`)

const ensurePanelToolsVisible = async (page: Page, panelName: 'component' | 'styles') => {
  const button = getToolsButton(page, panelName)
  const isPressed = await button.getAttribute('aria-pressed')
  if (isPressed !== 'true') {
    await button.click()
  }
}

const ensureDiagnosticsDrawerOpen = async (page: Page) => {
  const toggle = page.locator('#diagnostics-toggle')
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded !== 'true') {
    await toggle.click()
  }

  await expect(page.locator('#diagnostics-drawer')).toBeVisible()
}

const ensureDiagnosticsDrawerClosed = async (page: Page) => {
  const toggle = page.locator('#diagnostics-toggle')
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded === 'true') {
    await page.locator('#diagnostics-close').click()
  }

  await expect(page.locator('#diagnostics-drawer')).toBeHidden()
}

const ensureAiChatDrawerOpen = async (page: Page) => {
  const toggle = page.locator('#ai-chat-toggle')
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded !== 'true') {
    await toggle.click()
  }

  await expect(page.locator('#ai-chat-drawer')).toBeVisible()
}

const ensureOpenPrDrawerOpen = async (page: Page) => {
  const toggle = page.locator('#github-pr-toggle')
  await expect(toggle).toBeEnabled({ timeout: 60_000 })
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded !== 'true') {
    await toggle.click()
  }

  await expect(page.locator('#github-pr-drawer')).toBeVisible()
}

const connectByotWithSingleRepo = async (page: Page) => {
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

  await page.route(
    'https://api.github.com/repos/knightedcodemonkey/develop/branches**',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ name: 'main' }, { name: 'release' }]),
      })
    },
  )

  await page.locator('#github-token-input').fill('github_pat_fake_chat_1234567890')
  await page.locator('#github-token-add').click()
  await expect(page.locator('#status')).toHaveText('Loaded 1 writable repositories')
  await expect(page.locator('#github-pr-toggle')).toBeVisible()
}

const expectCollapseButtonState = async (
  page: Page,
  panelName: 'component' | 'styles' | 'preview',
  {
    axis,
    direction,
    collapsed,
    disabled,
  }: {
    axis: 'vertical' | 'horizontal'
    direction: 'left' | 'right' | 'none'
    collapsed: boolean
    disabled?: boolean
  },
) => {
  const button = getCollapseButton(page, panelName)

  await expect(button).toHaveAttribute('data-collapse-axis', axis)
  await expect(button).toHaveAttribute('data-collapse-direction', direction)
  await expect(button).toHaveAttribute('data-collapsed', collapsed ? 'true' : 'false')

  if (disabled !== undefined) {
    if (disabled) {
      await expect(button).toBeDisabled()
    } else {
      await expect(button).toBeEnabled()
    }
  }
}

test('BYOT controls stay hidden when feature flag is disabled', async ({ page }) => {
  await waitForAppReady(page)

  const byotControls = page.locator('#github-ai-controls')
  await expect(byotControls).toHaveAttribute('hidden', '')
  await expect(byotControls).toBeHidden()
  await expect(page.locator('#ai-chat-toggle')).toBeHidden()
  await expect(page.locator('#ai-chat-drawer')).toBeHidden()
  await expect(page.locator('#github-pr-toggle')).toBeHidden()
  await expect(page.locator('#github-pr-drawer')).toBeHidden()
})

test('BYOT controls render when feature flag is enabled by query param', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  const byotControls = page.locator('#github-ai-controls')
  await expect(byotControls).toBeVisible()
  await expect(page.locator('#github-token-input')).toBeVisible()
  await expect(page.locator('#github-token-add')).toBeVisible()
  await expect(page.locator('#github-ai-controls #ai-chat-toggle')).toBeHidden()
  await expect(page.locator('#github-ai-controls #github-pr-toggle')).toBeHidden()
})

test('GitHub token info panel reflects missing and present token states', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  const infoButton = page.locator('#github-token-info')
  const infoPanel = page.locator('#github-token-info-panel')
  const missingMessage = page.locator('.github-token-info-message--missing-token')
  const presentMessage = page.locator('.github-token-info-message--has-token')

  await expect(infoButton).toHaveText('?')
  await expect(infoButton).toHaveAttribute('data-token-state', 'missing')

  await infoButton.click()
  await expect(infoPanel).toBeVisible()
  await expect(missingMessage).toBeVisible()
  await expect(missingMessage).toContainText('Provide a GitHub PAT')
  await expect(missingMessage.getByRole('link', { name: 'docs' })).toHaveAttribute(
    'href',
    'https://github.com/knightedcodemonkey/develop/blob/main/docs/byot.md',
  )
  await expect(presentMessage).toBeHidden()

  await connectByotWithSingleRepo(page)
  await expect(infoButton).toHaveText('i')
  await expect(infoButton).toHaveAttribute('data-token-state', 'present')

  await infoButton.click()
  await expect(infoPanel).toBeVisible()
  await expect(presentMessage).toBeVisible()
  await expect(presentMessage).toContainText(
    'Use the trash icon to remove it from storage.',
  )
  await expect(missingMessage).toBeHidden()
})

test('deleting saved GitHub token requires confirmation modal', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)

  const dialog = page.locator('#clear-confirm-dialog')
  const tokenDelete = page.locator('#github-token-delete')
  const tokenAdd = page.locator('#github-token-add')
  const tokenInput = page.locator('#github-token-input')

  await expect(tokenDelete).toBeVisible()

  await tokenDelete.click()
  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.locator('#clear-confirm-title')).toHaveText(
    'Remove saved GitHub token?',
  )
  await expect(page.locator('#clear-confirm-copy')).toHaveText(
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

  await expect(page.locator('#status')).toHaveText('GitHub token removed')
  await expect(tokenAdd).toBeVisible()
  await expect(tokenDelete).toBeHidden()
  await expect(tokenInput).toHaveValue('')
})

test('AI chat drawer opens and closes when feature flag is enabled', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)

  const chatToggle = page.locator('#ai-chat-toggle')
  const chatDrawer = page.locator('#ai-chat-drawer')

  await expect(chatToggle).toBeVisible()
  await expect(chatToggle).toHaveAttribute('aria-expanded', 'false')

  await chatToggle.click()
  await expect(chatDrawer).toBeVisible()
  await expect(chatToggle).toHaveAttribute('aria-expanded', 'true')

  await page.locator('#ai-chat-close').click()
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

  await page.locator('#ai-chat-prompt').fill('Summarize this repository.')
  await page.locator('#ai-chat-send').click()

  await expect(page.locator('#ai-chat-status')).toHaveText(
    'Response streamed from GitHub.',
  )
  await expect(page.locator('#ai-chat-rate')).toHaveText('Rate limit info unavailable')
  await expect(page.locator('#ai-chat-messages')).toContainText(
    'Summarize this repository.',
  )
  await expect(page.locator('#ai-chat-messages')).toContainText(
    'Streaming response ready',
  )

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

  const includeEditorsToggle = page.locator('#ai-chat-include-editors')
  await expect(includeEditorsToggle).toBeChecked()
  await includeEditorsToggle.uncheck()

  await page.locator('#ai-chat-prompt').fill('No editor source this time.')
  await page.locator('#ai-chat-send').click()
  await expect(page.locator('#ai-chat-status')).toHaveText(
    'Response streamed from GitHub.',
  )
  await expect(page.locator('#ai-chat-rate')).toHaveText('Rate limit info unavailable')

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
  await page.locator('#ai-chat-model').selectOption(selectedModel)
  await expect(page.locator('#ai-chat-model')).toHaveValue(selectedModel)

  await page.locator('#ai-chat-prompt').fill('Use fallback path.')
  await page.locator('#ai-chat-send').click()

  await expect(page.locator('#ai-chat-status')).toHaveText('Fallback response loaded.')
  await expect(page.locator('#ai-chat-rate')).toHaveText('Remaining 17, resets 00:00 UTC')
  await expect(page.locator('#ai-chat-messages')).toContainText(
    'Fallback response from JSON path.',
  )
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

  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)

  await page.locator('#github-token-input').fill('github_pat_fake_1234567890')
  await page.locator('#github-token-add').click()

  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.locator('#github-pr-repo-select')
  await expect(repoSelect).toBeEnabled()
  await expect(page.locator('#status')).toHaveText('Loaded 2 writable repositories')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')

  await page.reload()
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect(page.locator('#status')).toHaveText('Loaded 2 writable repositories', {
    timeout: 60_000,
  })
  await expect(page.locator('#github-token-add')).toBeHidden()
  await expect(page.locator('#github-token-delete')).toBeVisible()
  await ensureOpenPrDrawerOpen(page)
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')
})

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

  await page.locator('#github-pr-head-branch').fill('Develop/Open-Pr-Test')
  await page.locator('#github-pr-component-path').fill('examples/component/App.tsx')
  await page.locator('#github-pr-styles-path').fill('examples/styles/app.css')
  await page.locator('#github-pr-title').fill('Apply editor updates from develop')
  await page
    .locator('#github-pr-body')
    .fill('Generated from editor content in @knighted/develop.')

  await page.locator('#github-pr-submit').click()

  const dialog = page.locator('#clear-confirm-dialog')
  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.locator('#clear-confirm-title')).toHaveText(
    'Open pull request with editor content?',
  )
  await expect(page.locator('#clear-confirm-copy')).toContainText(
    'Component file path: examples/component/App.tsx',
  )
  await expect(page.locator('#clear-confirm-copy')).toContainText(
    'Styles file path: examples/styles/app.css',
  )

  await dialog.getByRole('button', { name: 'Open PR' }).click()

  await expect(page.locator('#github-pr-status')).toContainText(
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
  await expect(page.locator('#github-pr-component-path')).toHaveValue(
    'examples/component/App.tsx',
  )
  await expect(page.locator('#github-pr-styles-path')).toHaveValue(
    'examples/styles/app.css',
  )
  await expect(page.locator('#github-pr-base-branch')).toHaveValue('main')

  await expect(page.locator('#github-pr-head-branch')).toHaveValue(
    /^develop\/develop\/editor-sync-/,
  )
  await expect(page.locator('#github-pr-head-branch')).not.toHaveValue(
    'Develop/Open-Pr-Test',
  )
  await expect(page.locator('#github-pr-title')).toHaveValue(
    'Apply component and styles edits to knightedcodemonkey/develop',
  )
  await expect(page.locator('#github-pr-body')).toHaveValue(
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

  await page.locator('#github-token-input').fill('github_pat_fake_1234567890')
  await page.locator('#github-token-add').click()
  await expect(page.locator('#status')).toHaveText('Loaded 2 writable repositories')

  await ensureOpenPrDrawerOpen(page)

  const repoSelect = page.locator('#github-pr-repo-select')
  const baseSelect = page.locator('#github-pr-base-branch')

  await repoSelect.selectOption('knightedcodemonkey/develop')
  await expect(baseSelect).toHaveValue('main')
  await expect(baseSelect.locator('option')).toHaveText(['main', 'develop-next'])

  await repoSelect.selectOption('knightedcodemonkey/css')
  await expect(baseSelect).toHaveValue('stable')
  await expect(baseSelect.locator('option')).toHaveText(['stable', 'release/1.x'])

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

test('Open PR drawer validates unsafe filepaths', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.locator('#github-pr-component-path').fill('../outside/App.tsx')
  await page.locator('#github-pr-submit').click()

  await expect(page.locator('#github-pr-status')).toContainText(
    'Component path: File path cannot include parent directory traversal.',
  )
  await expect(page.locator('#clear-confirm-dialog')).not.toHaveAttribute('open', '')
})

test('Open PR drawer allows dotted file segments that are not traversal', async ({
  page,
}) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.locator('#github-pr-component-path').fill('docs/v1.0..v1.1/App.tsx')
  await page.locator('#github-pr-styles-path').fill('styles/foo..bar.css')
  await page.locator('#github-pr-submit').click()

  await expect(page.locator('#clear-confirm-dialog')).toHaveAttribute('open', '')
  await expect(page.locator('#github-pr-status')).not.toContainText(
    'File path cannot include parent directory traversal.',
  )
})

test('Open PR drawer rejects trailing slash file paths', async ({ page }) => {
  await waitForAppReady(page, `${appEntryPath}?feature-ai=true`)
  await connectByotWithSingleRepo(page)
  await ensureOpenPrDrawerOpen(page)

  await page.locator('#github-pr-component-path').fill('src/components/')
  await page.locator('#github-pr-submit').click()

  await expect(page.locator('#github-pr-status')).toContainText(
    'Component path: File path must include a filename (no trailing slash).',
  )
  await expect(page.locator('#clear-confirm-dialog')).not.toHaveAttribute('open', '')
})

test('renders default playground preview', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot').uncheck()
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('supports layout and theme toggles', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)

  await page.getByLabel('Use light theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const colorInput = page.locator('#preview-bg-color')
  await colorInput.fill('#2456a8')
  await expect(page.locator('#preview-host')).toHaveCSS(
    'background-color',
    'rgb(36, 86, 168)',
  )
})

test('side layout keeps preview panel height within editor stack height', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)

  const metrics = await page.evaluate(() => {
    const stack = document.querySelector('.panels-stack--editors')
    const previewPanel = document.getElementById('preview-panel')
    const stackHeight = stack?.getBoundingClientRect().height ?? 0
    const previewHeight = previewPanel?.getBoundingClientRect().height ?? 0
    const previewOverflowY = previewPanel ? getComputedStyle(previewPanel).overflowY : ''
    return { stackHeight, previewHeight, previewOverflowY }
  })

  expect(metrics.stackHeight).toBeGreaterThan(0)
  expect(metrics.previewHeight).toBeGreaterThan(0)
  expect(metrics.previewHeight).toBeLessThanOrEqual(metrics.stackHeight + 2)
  expect(metrics.previewOverflowY).toBe('hidden')
})

test('side layout config keeps preview scrolling inside preview host', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()

  const scrollConfig = await page.evaluate(() => {
    const previewPanel = document.getElementById('preview-panel')
    const previewHost = document.getElementById('preview-host')
    if (!previewPanel || !previewHost) {
      return null
    }

    const panelStyles = getComputedStyle(previewPanel)
    const styles = getComputedStyle(previewHost)
    return {
      panelOverflowY: panelStyles.overflowY,
      panelOverflowX: panelStyles.overflowX,
      overflowY: styles.overflowY,
      minHeight: styles.minHeight,
    }
  })

  expect(scrollConfig).not.toBeNull()
  expect(scrollConfig?.panelOverflowY).toBe('hidden')
  expect(scrollConfig?.panelOverflowX).toBe('hidden')
  expect(['auto', 'scroll']).toContain(scrollConfig?.overflowY)
  expect(scrollConfig?.minHeight).toBe('0px')
})

test('expanded component and styles can shrink consistently in side layouts', async ({
  page,
}) => {
  await waitForInitialRender(page)

  for (const layoutLabel of ['Use side preview layout', 'Use left preview layout']) {
    await page.getByLabel(layoutLabel).click()

    const minHeights = await page.evaluate(() => {
      const component = document.getElementById('component-panel')
      const styles = document.getElementById('styles-panel')
      return {
        component: component
          ? Number.parseFloat(getComputedStyle(component).minHeight)
          : 0,
        styles: styles ? Number.parseFloat(getComputedStyle(styles).minHeight) : 0,
      }
    })

    expect(minHeights.component).toBeGreaterThanOrEqual(0)
    expect(minHeights.styles).toBeGreaterThanOrEqual(0)
    expect(Math.abs(minHeights.component - minHeights.styles)).toBeLessThanOrEqual(1)
  }
})

test('panel collapse axis and direction adapt to active layout', async ({ page }) => {
  await waitForInitialRender(page)
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid/)

  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: false,
  })
  await expectCollapseButtonState(page, 'styles', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
  })
  await expectCollapseButtonState(page, 'preview', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
  })

  await page.getByLabel('Use side preview layout').click()
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
  })
  await expectCollapseButtonState(page, 'component', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
  })

  await page.getByLabel('Use left preview layout').click()
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: false,
  })
})

test('prevents collapsing all three panels at once', async ({ page }) => {
  await waitForInitialRender(page)

  await getCollapseButton(page, 'component').click()
  await getCollapseButton(page, 'styles').click()

  await expect(page.locator('#component-panel')).toHaveClass(
    /panel--collapsed-horizontal/,
  )
  await expect(page.locator('#styles-panel')).toHaveClass(/panel--collapsed-horizontal/)

  await expectCollapseButtonState(page, 'preview', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
    disabled: true,
  })
  await expect(getCollapseButton(page, 'preview')).toHaveAttribute(
    'title',
    'At least one panel must remain expanded.',
  )

  await getCollapseButton(page, 'component').click()
  await expectCollapseButtonState(page, 'preview', {
    axis: 'vertical',
    direction: 'none',
    collapsed: false,
    disabled: false,
  })
})

test('does not persist panel collapse state across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await getCollapseButton(page, 'component').click()
  await expect(page.locator('#component-panel')).toHaveClass(
    /panel--collapsed-horizontal/,
  )
  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: true,
  })

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.locator('#component-panel')).not.toHaveClass(
    /panel--collapsed-horizontal|panel--collapsed-vertical/,
  )
  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: false,
  })
})

test('gear tools toggles default inactive and switch active/inactive per panel', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const componentPanel = page.locator('#component-panel')
  const stylesPanel = page.locator('#styles-panel')
  const componentTools = getToolsButton(page, 'component')
  const stylesTools = getToolsButton(page, 'styles')

  await expect(componentPanel).toHaveClass(/panel--tools-hidden/)
  await expect(stylesPanel).toHaveClass(/panel--tools-hidden/)
  await expect(componentTools).toHaveAttribute('aria-pressed', 'false')
  await expect(stylesTools).toHaveAttribute('aria-pressed', 'false')

  await componentTools.click()
  await expect(componentPanel).not.toHaveClass(/panel--tools-hidden/)
  await expect(componentTools).toHaveAttribute('aria-pressed', 'true')
  await expect(componentTools).toHaveAttribute('title', 'Hide component tools')

  await componentTools.click()
  await expect(componentPanel).toHaveClass(/panel--tools-hidden/)
  await expect(componentTools).toHaveAttribute('aria-pressed', 'false')
  await expect(componentTools).toHaveAttribute('title', 'Show component tools')

  await stylesTools.click()
  await expect(stylesPanel).not.toHaveClass(/panel--tools-hidden/)
  await expect(stylesTools).toHaveAttribute('aria-pressed', 'true')
  await expect(stylesTools).toHaveAttribute('title', 'Hide styles tools')
})

test('renders in react mode with css modules', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.locator('#render-mode').selectOption('react')
  await page.locator('#style-mode').selectOption('module')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('transpiles TypeScript annotations in component source', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot').uncheck()
  await setComponentEditorSource(
    page,
    [
      'const Button = ({ label }: { label: string }): unknown => <button>{label}</button>',
      'const App = () => <Button label="typed" />',
    ].join('\n'),
  )

  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#preview-host button')).toContainText('typed')
})

test('react mode typecheck loads types without malformed URL fetches', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const typeRequestUrls: string[] = []
  page.on('request', request => {
    const url = request.url()
    if (url.includes('@types/')) {
      typeRequestUrls.push(url)
    }
  })

  await page.locator('#render-mode').selectOption('react')
  await page.getByRole('button', { name: 'Typecheck' }).click()

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No TypeScript errors found.',
  )

  const diagnosticsText = await page.locator('#diagnostics-component').innerText()
  expect(diagnosticsText).not.toContain("Cannot find type definition file for 'react'")
  expect(diagnosticsText).not.toContain(
    "Cannot find type definition file for 'react-dom'",
  )
  expect(diagnosticsText).not.toContain("Cannot find module 'react-dom/client'")
  expect(diagnosticsText).not.toContain('Cannot find module "react-dom/client"')

  expect(typeRequestUrls.some(url => url.includes('@types/react'))).toBeTruthy()

  const malformedTypeRequestPatterns = [
    '/@types/global.d.ts/package.json',
    '/user-context',
    '/https:/',
  ]

  for (const pattern of malformedTypeRequestPatterns) {
    expect(typeRequestUrls.some(url => url.includes(pattern))).toBeFalsy()
  }
})

test('dom mode typecheck does not hydrate react type graph', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  const typeRequestUrls: string[] = []
  page.on('request', request => {
    const url = request.url()
    if (url.includes('@types/')) {
      typeRequestUrls.push(url)
    }
  })

  await runTypecheck(page)

  await expect(page.locator('#status')).toHaveText('Rendered')
  expect(typeRequestUrls.some(url => url.includes('@types/react'))).toBeFalsy()
  expect(typeRequestUrls.some(url => url.includes('@types/react-dom'))).toBeFalsy()
})

test('react mode executes default React import without TDZ runtime failure', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.locator('#render-mode').selectOption('react')
  await setComponentEditorSource(
    page,
    [
      "import React from 'react'",
      'const App = () => <button>react default import works</button>',
    ].join('\n'),
  )

  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#preview-host button')).toContainText(
    'react default import works',
  )
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('clearing component source reports clear action without error status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  await page.getByLabel('Clear component source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(page.locator('#preview-host button')).toHaveCount(0)
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
  await expect(page.locator('#status')).toHaveText('Component cleared')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
})

test('jsx syntax errors affect status but not diagnostics toggle severity', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const App = () => <button', 'const value = 1'].join('\n'),
  )

  await expect(page.locator('#status')).toHaveText('Error')
  await expect(page.locator('#status')).toHaveClass(/status--error/)
  await expect(page.locator('#preview-host pre')).toContainText('[jsx]')
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
})

test('requires render button when auto render is disabled', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')
  await ensurePanelToolsVisible(page, 'styles')

  const autoRenderToggle = page.getByLabel('Auto render')
  const renderButton = page.getByRole('button', { name: 'Render' })
  const styleMode = page.locator('#style-mode')

  await autoRenderToggle.uncheck()
  await expect(renderButton).toBeVisible()

  await styleMode.selectOption('module')

  await renderButton.click()
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#preview-host pre')).toHaveCount(0)
})

test('persists layout and theme across reload', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await page.getByLabel('Use light theme').click()
  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await waitForInitialRender(page)

  await expect(page.locator('.app-grid')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('renders with less style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.locator('#style-mode').selectOption('less')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('renders with sass style mode', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.getByLabel('ShadowRoot').uncheck()
  await page.locator('#style-mode').selectOption('sass')
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('style compilation errors populate styles diagnostics scope', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.locator('#style-mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  await expect(page.locator('#status')).toHaveText('Error')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-styles')).toContainText(
    'Style compilation failed.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('Undefined variable')
})

test('clear component action opens confirm dialog and can be canceled', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  const jsxEditor = page.locator('#jsx-editor')

  const beforeValue = await jsxEditor.inputValue()
  await page.getByLabel('Clear component source').click()

  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.locator('#clear-confirm-title')).toHaveText('Clear Component source?')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
  await expect(jsxEditor).toHaveValue(beforeValue)
})

test('clear styles action opens confirm dialog and clears on confirm', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const dialog = page.locator('#clear-confirm-dialog')
  const cssEditor = page.locator('#css-editor')

  await page.getByLabel('Clear styles source').click()

  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.locator('#clear-confirm-title')).toHaveText('Clear Styles source?')

  await dialog.getByRole('button', { name: 'Clear' }).click()
  await expect(dialog).not.toHaveAttribute('open', '')
  await expect(cssEditor).toHaveValue('')
  await expect(page.locator('#status')).toHaveText('Styles cleared')
})

test('clearing styles keeps diagnostics error state but resets status styling', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    ["const count: number = 'oops'", 'const App = () => <button>ready</button>'].join(
      '\n',
    ),
  )

  await page.getByRole('button', { name: 'Typecheck' }).click()

  await expect(page.locator('#status')).toHaveText(/Rendered \(Type errors: [1-9]\d*\)/)
  await expect(page.locator('#status')).toHaveClass(/status--error/)
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  const dialog = page.locator('#clear-confirm-dialog')
  await ensureDiagnosticsDrawerClosed(page)
  await page.getByLabel('Clear styles source').click()
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.getByRole('button', { name: 'Clear' }).click()

  await expect(page.locator('#status')).toHaveText('Styles cleared')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)
})

test('clear component diagnostics removes type errors and restores rendered status', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'component')

  await setComponentEditorSource(
    page,
    ["const count: number = 'oops'", 'const App = () => <button>ready</button>'].join(
      '\n',
    ),
  )

  await page.getByRole('button', { name: 'Typecheck' }).click()
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#status')).toHaveText(/Rendered \(Type errors: [1-9]\d*\)/)

  await ensureDiagnosticsDrawerOpen(page)
  await page.locator('#diagnostics-clear-component').click()

  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
})

test('clear all diagnostics removes style compile diagnostics', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.locator('#style-mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-styles')).toContainText(
    'Style compilation failed.',
  )

  await page.locator('#diagnostics-clear-all').click()
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('No diagnostics yet.')
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
})

test('clear styles diagnostics removes style compile diagnostics', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')

  await page.locator('#style-mode').selectOption('sass')
  await setStylesEditorSource(page, '.card { color: $missing; }')

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-styles')).toContainText(
    'Style compilation failed.',
  )

  await page.locator('#diagnostics-clear-styles').click()
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('No diagnostics yet.')
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
})

test('typecheck success reports ok diagnostics state in button and drawer', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await runTypecheck(page)

  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(/diagnostics-toggle--ok/)
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No TypeScript errors found.',
  )
})

test('typecheck error reports diagnostics count in button and details in drawer', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ["const broken: number = 'oops'", 'const App = () => <button>hello</button>'].join(
      '\n',
    ),
  )

  await runTypecheck(page)

  await expect(page.locator('#status')).toHaveText(/Rendered \(Type errors: [1-9]\d*\)/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)

  await expect(page.locator('#diagnostics-drawer')).toBeVisible()
  await expect(page.locator('#diagnostics-component')).toContainText('TypeScript found')
  await expect(page.locator('#diagnostics-component')).toContainText('TS')
})

test('component diagnostics rows navigate editor to reported line', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      "const brokenCount: number = 'oops'",
      'const App = () => <button>{brokenCount.toUpperCase()}</button>',
    ].join('\n'),
  )

  await runTypecheck(page)

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await ensureDiagnosticsDrawerOpen(page)

  const targetDiagnostic = page
    .locator('#diagnostics-component .diagnostic-line-button[data-diagnostic-line="2"]')
    .first()
  await expect(targetDiagnostic).toBeVisible()

  await targetDiagnostic.click()
  await expect(targetDiagnostic).toHaveClass(/diagnostic-line-button--active/)
  await expect.poll(() => getActiveComponentEditorLineNumber(page)).toBe('2')
})

test('component diagnostics support arrow navigation and enter jump', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      "const broken: number = 'oops'",
      'const App = () => <button>{missingName}</button>',
    ].join('\n'),
  )

  await runTypecheck(page)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await ensureDiagnosticsDrawerOpen(page)

  const firstDiagnostic = page
    .locator('#diagnostics-component .diagnostic-line-button')
    .first()
  const secondDiagnostic = page
    .locator('#diagnostics-component .diagnostic-line-button')
    .nth(1)

  await expect(firstDiagnostic).toBeVisible()
  await expect(secondDiagnostic).toBeVisible()

  await firstDiagnostic.focus()
  await firstDiagnostic.press('ArrowDown')
  await expect(secondDiagnostic).toBeFocused()

  await secondDiagnostic.press('Enter')
  await expect(secondDiagnostic).toHaveClass(/diagnostic-line-button--active/)
  await expect.poll(() => getActiveComponentEditorLineNumber(page)).toBe('2')
})

test('component lint error reports diagnostics count and details', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const unusedValue = 1', 'const App = () => <button>lint me</button>'].join('\n'),
  )

  await runComponentLint(page)

  await expect(page.locator('#status')).toHaveText(/Rendered \(Lint issues: [1-9]\d*\)/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)

  await expect(page.locator('#diagnostics-drawer')).toBeVisible()
  await expect(page.locator('#diagnostics-component')).toContainText(
    'Biome reported issues.',
  )
})

test('styles diagnostics rows navigate editor to reported line', async ({ page }) => {
  await waitForInitialRender(page)

  await ensurePanelToolsVisible(page, 'styles')
  await setStylesEditorSource(
    page,
    ['.card {', '  color: red', '  color: blue;', '}'].join('\n'),
  )

  await runStylesLint(page)

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await ensureDiagnosticsDrawerOpen(page)

  const targetDiagnostic = page
    .locator('#diagnostics-styles .diagnostic-line-button[data-diagnostic-line="3"]')
    .first()
  await expect(targetDiagnostic).toBeVisible()

  await targetDiagnostic.click()
  await expect(targetDiagnostic).toHaveClass(/diagnostic-line-button--active/)
  await expect.poll(() => getActiveStylesEditorLineNumber(page)).toBe('3')
})

test('clear component diagnostics resets rendered lint-issue status pill', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      'const unusedValue = 1',
      'const App = () => <button type="button">lint me</button>',
    ].join('\n'),
  )

  await runComponentLint(page)

  await expect(page.locator('#status')).toHaveText(/Rendered \(Lint issues: [1-9]\d*\)/)
  await expect(page.locator('#status')).toHaveClass(/status--error/)

  await ensureDiagnosticsDrawerOpen(page)
  await page.locator('#diagnostics-clear-component').click()

  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
})

test('component lint ignores unused App View and render bindings', async ({ page }) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    [
      'function App() { return <button type="button">App</button> }',
      'function View() { return <section>View</section> }',
      'function render() { return null }',
    ].join('\n'),
  )

  await runComponentLint(page)

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No Biome issues found.',
  )

  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(/diagnostics-toggle--ok/)

  const diagnosticsText = await page.locator('#diagnostics-component').innerText()
  expect(diagnosticsText).not.toContain('This variable App is unused')
  expect(diagnosticsText).not.toContain('This variable View is unused')
  expect(diagnosticsText).not.toContain('This variable render is unused')
  expect(diagnosticsText).not.toContain('This function App is unused')
  expect(diagnosticsText).not.toContain('This function View is unused')
  expect(diagnosticsText).not.toContain('This function render is unused')
})

test('component lint with unresolved issues enters pending diagnostics state while typing', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await setComponentEditorSource(
    page,
    ['const unusedValue = 1', 'const App = () => <button>pending</button>'].join('\n'),
  )

  await runComponentLint(page)

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )

  await setComponentEditorSource(
    page,
    ['const unusedValue = 1', 'const App = () => <button>pending now</button>'].join(
      '\n',
    ),
  )

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--pending/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveAttribute('aria-busy', 'true')

  await expect(page.locator('#status')).toHaveText(/Rendered \(Lint issues: [1-9]\d*\)/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveAttribute('aria-busy', 'false')
})

test('changing css dialect resets diagnostics after lint and typecheck runs', async ({
  page,
}) => {
  await waitForInitialRender(page)
  await ensurePanelToolsVisible(page, 'styles')

  await setComponentEditorSource(
    page,
    [
      "const broken: number = 'oops'",
      'const unusedValue = 1',
      'const App = () => <button>reset me</button>',
    ].join('\n'),
  )

  await runTypecheck(page)
  await runComponentLint(page)

  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--error/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText(/Diagnostics \([1-9]\d*\)/)

  await page.locator('#style-mode').selectOption('less')

  await expect(page.locator('#status')).toHaveText('Rendered')
  await expect(page.locator('#status')).toHaveClass(/status--neutral/)
  await expect(page.locator('#diagnostics-toggle')).toHaveClass(
    /diagnostics-toggle--neutral/,
  )
  await expect(page.locator('#diagnostics-toggle')).toHaveText('Diagnostics')

  await ensureDiagnosticsDrawerOpen(page)
  await expect(page.locator('#diagnostics-component')).toContainText(
    'No diagnostics yet.',
  )
  await expect(page.locator('#diagnostics-styles')).toContainText('No diagnostics yet.')
})
