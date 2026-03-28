import { expect, test } from '@playwright/test'
import {
  expectCollapseButtonState,
  expectPreviewHasRenderedContent,
  getCollapseButton,
  getToolsButton,
  waitForInitialRender,
} from './helpers/app-test-helpers.js'

test('renders default playground preview', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('ShadowRoot').uncheck()
  await expect(page.getByRole('status', { name: 'App status' })).toHaveText('Rendered')
  await expectPreviewHasRenderedContent(page)
})

test('supports layout and theme toggles', async ({ page }) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)

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

test('side layout keeps preview panel height within editor stack height', async ({
  page,
}) => {
  await waitForInitialRender(page)

  await page.getByLabel('Use side preview layout').click()
  await expect(page.getByRole('main')).toHaveClass(/app-grid--preview-right/)

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
  await expect(page.getByRole('main')).toHaveClass(/app-grid/)

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
  const componentPanel = page.getByRole('region', { name: 'Component' })
  const stylesPanel = page.getByRole('region', { name: 'Styles' })

  await getCollapseButton(page, 'component').click()
  await getCollapseButton(page, 'styles').click()

  await expect(componentPanel).toHaveClass(/panel--collapsed-horizontal/)
  await expect(stylesPanel).toHaveClass(/panel--collapsed-horizontal/)

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
  const componentPanel = page.getByRole('region', { name: 'Component' })

  await getCollapseButton(page, 'component').click()
  await expect(componentPanel).toHaveClass(/panel--collapsed-horizontal/)
  await expectCollapseButtonState(page, 'component', {
    axis: 'horizontal',
    direction: 'left',
    collapsed: true,
  })

  await page.reload()
  await waitForInitialRender(page)

  await expect(componentPanel).not.toHaveClass(
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

  const componentPanel = page.getByRole('region', { name: 'Component' })
  const stylesPanel = page.getByRole('region', { name: 'Styles' })
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
