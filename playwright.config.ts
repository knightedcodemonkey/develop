import { defineConfig, devices } from '@playwright/test'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env

const isCI = env?.CI === 'true'
const HOST = env?.PLAYWRIGHT_HOST ?? '127.0.0.1'
const PORT = Number(env?.PLAYWRIGHT_PORT ?? 4174)
const baseURL = env?.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`
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
  timeout: 45_000,
  retries: isCI ? 1 : 0,
  expect: {
    timeout: 15_000,
  },
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npx http-server . -a ${HOST} -p ${PORT} -c-1`,
    url: `${baseURL}/src/index.html`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects,
})
