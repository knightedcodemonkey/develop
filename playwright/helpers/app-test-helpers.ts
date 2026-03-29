import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const webServerMode = process.env.PLAYWRIGHT_WEB_SERVER_MODE ?? 'dev'

export const appEntryPath =
  webServerMode === 'preview' ? '/index.html' : '/src/index.html'

export type ChatRequestMessage = {
  role?: string
  content?: string
}

export type ChatRequestBody = {
  metadata?: unknown
  messages?: ChatRequestMessage[]
  model?: string
  stream?: boolean
}

export type CreateRefRequestBody = {
  ref?: string
  sha?: string
}

export type PullRequestCreateBody = {
  head?: string
  base?: string
}

export type BranchesByRepo = Record<string, string[]>

export const waitForAppReady = async (page: Page, path = appEntryPath) => {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: '@knighted/develop' })).toBeVisible()
  await expect
    .poll(async () => {
      const statusText = (
        await page.getByRole('status', { name: 'App status' }).textContent()
      )?.trim()

      return (
        statusText === 'Rendered' ||
        statusText?.startsWith('Rendered (Type errors:') ||
        statusText === 'Error'
      )
    })
    .toBe(true)
}

export const waitForInitialRender = async (page: Page) => {
  await waitForAppReady(page)
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
}

export const expectPreviewHasRenderedContent = async (page: Page) => {
  const previewHost = page.locator('#preview-host')
  await expect(previewHost.locator('pre')).toHaveCount(0)
  await expect
    .poll(() => previewHost.evaluate(node => node.childElementCount))
    .toBeGreaterThan(0)
}

export const setComponentEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.component-panel .cm-content').first()
  await editorContent.fill(source)
}

export const setStylesEditorSource = async (page: Page, source: string) => {
  const editorContent = page.locator('.styles-panel .cm-content').first()
  await editorContent.fill(source)
}

export const getActiveComponentEditorLineNumber = async (page: Page) => {
  return page
    .locator('#component-panel .cm-activeLineGutter')
    .first()
    .innerText()
    .then(text => text.trim())
}

export const runTypecheck = async (page: Page) => {
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('button', { name: 'Typecheck' }).click()
}

export const runComponentLint = async (page: Page) => {
  await ensurePanelToolsVisible(page, 'component')
  await page.getByRole('button', { name: 'Component lint' }).click()
}

export const runStylesLint = async (page: Page) => {
  await ensurePanelToolsVisible(page, 'styles')
  await page.getByRole('button', { name: 'Styles lint' }).click()
}

export const getActiveStylesEditorLineNumber = async (page: Page) => {
  return page
    .locator('#styles-panel .cm-activeLineGutter')
    .first()
    .innerText()
    .then(text => text.trim())
}

export const getCollapseButton = (
  page: Page,
  panelName: 'component' | 'styles' | 'preview',
) => page.locator(`#collapse-${panelName}`)

export const getToolsButton = (page: Page, panelName: 'component' | 'styles') =>
  page.locator(`#tools-${panelName}`)

export const ensurePanelToolsVisible = async (
  page: Page,
  panelName: 'component' | 'styles',
) => {
  const button = getToolsButton(page, panelName)
  const isPressed = await button.getAttribute('aria-pressed')
  if (isPressed !== 'true') {
    await button.click()
  }
}

export const ensureDiagnosticsDrawerOpen = async (page: Page) => {
  const toggle = page.getByRole('button', {
    name: /^Diagnostics(?:\s+\([1-9]\d*\)|\s+✓)?$/,
  })
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded !== 'true') {
    await toggle.click()
  }

  await expect(page.getByRole('complementary', { name: 'Diagnostics' })).toBeVisible()
}

export const ensureDiagnosticsDrawerClosed = async (page: Page) => {
  const toggle = page.getByRole('button', {
    name: /^Diagnostics(?:\s+\([1-9]\d*\)|\s+✓)?$/,
  })
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded === 'true') {
    await page.getByRole('button', { name: 'Close diagnostics drawer' }).click()
  }

  await expect(page.getByRole('complementary', { name: 'Diagnostics' })).toBeHidden()
}

export const ensureAiChatDrawerOpen = async (page: Page) => {
  const toggle = page.getByRole('button', { name: 'Chat' })
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded !== 'true') {
    await toggle.click()
  }

  await expect(page.getByRole('complementary', { name: 'AI Chat' })).toBeVisible()
}

export const ensureOpenPrDrawerOpen = async (page: Page) => {
  const toggle = page.getByRole('button', {
    name: /Open pull request|Push commit to active pull request branch/,
  })
  await expect(toggle).toBeEnabled({ timeout: 60_000 })
  const isExpanded = await toggle.getAttribute('aria-expanded')

  if (isExpanded !== 'true') {
    await toggle.click()
  }

  await expect(
    page.getByRole('complementary', { name: /Open Pull Request|Push Commit/ }),
  ).toBeVisible()
}

export const mockRepositoryBranches = async (
  page: Page,
  branchesByRepo: BranchesByRepo = {},
) => {
  await page.route('https://api.github.com/repos/**/branches**', async route => {
    const url = new URL(route.request().url())
    const match = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/branches$/)
    const repositoryKey = match ? `${match[1]}/${match[2]}` : ''

    const branchNames =
      branchesByRepo[repositoryKey] && branchesByRepo[repositoryKey].length > 0
        ? branchesByRepo[repositoryKey]
        : ['main']

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(branchNames.map(name => ({ name }))),
    })
  })
}

export const connectByotWithSingleRepo = async (page: Page) => {
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
    .fill('github_pat_fake_chat_1234567890')
  await page.getByRole('button', { name: 'Add GitHub token' }).click()

  const repoSelect = page.getByLabel('Pull request repository')
  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')

  const pushModeVisible = await page
    .getByRole('button', { name: 'Push commit to active pull request branch' })
    .isVisible()

  if (pushModeVisible) {
    await expect(repoSelect).toBeDisabled()
  } else {
    await expect(repoSelect).toBeEnabled()
  }

  await expect(repoSelect).toHaveValue('knightedcodemonkey/develop')

  await expect(
    page.getByRole('button', {
      name: /Open pull request|Push commit to active pull request branch/,
    }),
  ).toBeVisible()
}

export const expectCollapseButtonState = async (
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
