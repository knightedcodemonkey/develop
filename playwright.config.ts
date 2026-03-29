import { defineConfig, devices } from '@playwright/test'

const env = process.env
const isCI = env?.CI === 'true'
const HOST = env?.PLAYWRIGHT_HOST ?? '127.0.0.1'
const PORT = Number(env?.PLAYWRIGHT_PORT ?? 4174)
const baseURL = env?.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`
const webServerMode = env?.PLAYWRIGHT_WEB_SERVER_MODE ?? 'dev'
const usePreviewServer = webServerMode === 'preview'
const webServerCommand = usePreviewServer
  ? `npx http-server dist -a ${HOST} -p ${PORT} -c-1`
  : `npx http-server . -a ${HOST} -p ${PORT} -c-1`
const webServerReadyUrl = usePreviewServer
  ? `${baseURL}/index.html`
  : `${baseURL}/src/index.html`
const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
]

if (isCI) {
  projects.push({
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  })
}

export default defineConfig({
  testDir: 'playwright',
  timeout: isCI ? 120_000 : 20_000,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  expect: {
    timeout: isCI ? 90_000 : 15_000,
  },
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: webServerCommand,
    url: webServerReadyUrl,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects,
})
