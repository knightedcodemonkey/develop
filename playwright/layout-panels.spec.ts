import { expect, test } from '@playwright/test'
import {
  expectCollapseButtonState,
  expectPreviewHasRenderedContent,
  getCollapseButton,
  getPreviewFrame,
  getToolsButton,
  waitForInitialRender,
} from './helpers/app-test-helpers.js'

test('renders default playground preview', async ({ page }) => {
  await waitForInitialRender(page)

  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('supports theme toggles', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use light theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const colorInput = page.getByLabel('Background')
  await colorInput.fill('#2456a8')
  const previewBackgroundColor = await page.evaluate(() => {
    const previewHost = document.getElementById('preview-host')
    return previewHost ? getComputedStyle(previewHost).backgroundColor : ''
  })
  expect(previewBackgroundColor).toBe('rgb(36, 86, 168)')
})

test('light theme defaults preview background to white', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use light theme').click()

  const previewBackgroundColor = await page.evaluate(() => {
    const previewHost = document.getElementById('preview-host')
    return previewHost ? getComputedStyle(previewHost).backgroundColor : ''
  })

  expect(previewBackgroundColor).toBe('rgb(255, 255, 255)')
})

test('dark theme defaults preview background to editor background', async ({ page }) => {
  await waitForInitialRender(page)

  const colors = await page.evaluate(() => {
    const previewHost = document.getElementById('preview-host')
    const componentPanel = document.getElementById('editor-panel-component')

    return {
      preview: previewHost ? getComputedStyle(previewHost).backgroundColor : '',
      editor: componentPanel ? getComputedStyle(componentPanel).backgroundColor : '',
    }
  })

  const toRgbChannels = (value: string) =>
    (value.match(/\d+/g) ?? []).slice(0, 3).map(entry => Number.parseInt(entry, 10))

  expect(toRgbChannels(colors.preview)).toEqual(toRgbChannels(colors.editor))
})

test('changing preview background keeps applied preview styles', async ({ page }) => {
  await waitForInitialRender(page)

  const previewFrameRoot = getPreviewFrame(page).locator('html')

  await expect(previewFrameRoot).toHaveCount(1)
  const hasComponentStylesBefore = await previewFrameRoot.evaluate(() => {
    const styleElement = document.getElementById('knighted-preview-styles')
    if (!(styleElement instanceof HTMLStyleElement)) {
      return false
    }

    return styleElement.textContent?.includes('.counter-button') ?? false
  })
  expect(hasComponentStylesBefore).toBe(true)

  await page.getByLabel('Background').fill('#b1aaaa')

  const hasComponentStylesAfter = await previewFrameRoot.evaluate(() => {
    const styleElement = document.getElementById('knighted-preview-styles')
    if (!(styleElement instanceof HTMLStyleElement)) {
      return false
    }

    return styleElement.textContent?.includes('.counter-button') ?? false
  })
  expect(hasComponentStylesAfter).toBe(true)

  await expect(previewFrameRoot).toHaveCSS('background-color', 'rgb(177, 170, 170)')
})

test('fixed layout keeps preview panel height within editor stack height', async ({
  page,
}) => {
  await waitForInitialRender(page)

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

test('fixed layout keeps preview scrolling inside preview host', async ({ page }) => {
  await waitForInitialRender(page)

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

test('expanded component and styles can shrink consistently in fixed layout', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const minHeights = await page.evaluate(() => {
    const component = document.getElementById('editor-panel-component')
    const styles = document.getElementById('editor-panel-styles')
    return {
      component: component ? Number.parseFloat(getComputedStyle(component).minHeight) : 0,
      styles: styles ? Number.parseFloat(getComputedStyle(styles).minHeight) : 0,
    }
  })

  expect(minHeights.component).toBeGreaterThanOrEqual(0)
  expect(minHeights.styles).toBeGreaterThanOrEqual(0)
  expect(Math.abs(minHeights.component - minHeights.styles)).toBeLessThanOrEqual(1)
})

test('panel collapse axis and direction match fixed layout', async ({ page }) => {
  await waitForInitialRender(page)
  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)
  await expect(page.locator('#collapse-component')).toHaveCount(0)
  await expect(page.locator('#collapse-styles')).toHaveCount(0)

  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
  })
})

test('preview panel can collapse and expand', async ({ page }) => {
  await waitForInitialRender(page)
  const previewPanel = page.locator('#preview-panel')

  await getCollapseButton(page, 'preview').click()
  await expect(previewPanel).toHaveClass(/panel--collapsed-horizontal/)

  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: true,
    disabled: false,
  })

  await getCollapseButton(page, 'preview').click()
  await expect(previewPanel).not.toHaveClass(/panel--collapsed-horizontal/)
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
    disabled: false,
  })
})

test('does not persist panel collapse state across reload', async ({ page }) => {
  await waitForInitialRender(page)
  const previewPanel = page.locator('#preview-panel')

  await getCollapseButton(page, 'preview').click()
  await expect(previewPanel).toHaveClass(/panel--collapsed-horizontal/)
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: true,
  })

  await page.reload()
  await waitForInitialRender(page)

  await expect(previewPanel).not.toHaveClass(
    /panel--collapsed-horizontal|panel--collapsed-vertical/,
  )
  await expectCollapseButtonState(page, 'preview', {
    axis: 'horizontal',
    direction: 'right',
    collapsed: false,
  })
})

test('gear tools toggles default inactive and switch active/inactive per panel', async ({
  page,
}) => {
  await waitForInitialRender(page)

  const componentPanel = page.locator('#editor-panel-component')
  const stylesPanel = page.locator('#editor-panel-styles')
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

  await page.getByRole('button', { name: 'Open tab app.css' }).click()
  await stylesTools.click()
  await expect(stylesPanel).not.toHaveClass(/panel--tools-hidden/)
  await expect(stylesTools).toHaveAttribute('aria-pressed', 'true')
  await expect(stylesTools).toHaveAttribute('title', 'Hide styles tools')
})

test('fixed layout keeps inactive editor panel hidden', async ({ page }) => {
  await waitForInitialRender(page)

  const componentPanel = page.locator('#editor-panel-component')
  const stylesPanel = page.locator('#editor-panel-styles')

  const assertEntryPanelVisible = async () => {
    await page.getByRole('button', { name: 'Open tab App.tsx' }).click()
    await expect(componentPanel).toBeVisible()
    await expect(stylesPanel).toBeHidden()
  }

  await assertEntryPanelVisible()
})
