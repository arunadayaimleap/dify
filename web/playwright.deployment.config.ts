import { defineConfig } from '@playwright/test'

/**
 * Split-host smoke: signin must inject a cookie-safe API prefix (same host as the page, or path-only /console/api).
 * Run: PLAYWRIGHT_BASE_URL=https://your-web.up.railway.app pnpm test:e2e:deployment
 * First run: pnpm exec playwright install chromium
 */
export default defineConfig({
  testDir: './e2e/deployment',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
})
