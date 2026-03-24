import { expect, test } from '@playwright/test'

/**
 * End-to-end smoke against a live Railway (or any) web deployment.
 * Requires PLAYWRIGHT_BASE_URL. Optional: PLAYWRIGHT_RAILWAY_EMAIL, PLAYWRIGHT_RAILWAY_PASSWORD.
 */
test.describe('Railway deployment full flow', () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(!baseURL, 'Set PLAYWRIGHT_BASE_URL (e.g. https://dify-web-….up.railway.app)')
  })

  test('sign-in loads, login succeeds, apps/workspace APIs succeed, workflow canvas can render', async ({ page, baseURL }) => {
    const email = process.env.PLAYWRIGHT_RAILWAY_EMAIL || 'railway-admin@example.com'
    const password = process.env.PLAYWRIGHT_RAILWAY_PASSWORD || 'Adminrail2026'

    const workspaceStatuses: number[] = []
    const draftStatuses: number[] = []

    page.on('response', (response) => {
      const u = response.url()
      if (u.includes('/console/api/workspaces') && response.request().method() === 'GET')
        workspaceStatuses.push(response.status())
      if (u.includes('/workflows/draft') && response.request().method() === 'GET')
        draftStatuses.push(response.status())
    })

    await page.goto(`${baseURL!.replace(/\/$/, '')}/signin`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toHaveAttribute('data-api-prefix', /.+/)

    // Shell shows a loading state until setup / system-features resolve over the proxy.
    const emailInput = page.locator('#email')
    const passwordInput = page.locator('#password')
    await expect(emailInput).toBeVisible({ timeout: 120_000 })
    await expect(passwordInput).toBeVisible({ timeout: 30_000 })

    const loginButton = page.getByRole('button', { name: /sign in|login|登录/i }).first()
    await expect(loginButton).toBeVisible({ timeout: 15_000 })

    await emailInput.fill(email)
    await passwordInput.fill(password)
    await loginButton.click()

    await page.waitForURL(/\/(apps|install|dashboard)/, { timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})

    // Workspace list must succeed at least once after login (session + proxy OK).
    const workspaceOk = workspaceStatuses.some(s => s >= 200 && s < 300)
    expect(workspaceOk, `Expected a 2xx GET /workspaces; got statuses: ${workspaceStatuses.join(',') || 'none'}`).toBe(true)

    // Studio / apps surface should be usable.
    await expect(page.getByText(/Studio|Explore|Apps/i).first()).toBeVisible({ timeout: 30_000 })

    const appAnchors = page.locator('a[href*="/app/"]')
    const appCount = await appAnchors.count()
    if (appCount === 0) {
      // Login + studio can succeed with zero apps; workflow canvas is optional.
      return
    }

    const href = await appAnchors.first().getAttribute('href')
    expect(href, 'app link href').toMatch(/\/app\/[0-9a-f-]{36}/i)

    const origin = baseURL!.replace(/\/$/, '')
    const appPath = href!.split('?')[0].replace(/\/$/, '')
    await page.goto(`${origin}${appPath}/workflow`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})

    const draftOk = draftStatuses.some(s => s >= 200 && s < 300)
    expect(draftOk, `Expected a 2xx GET workflows/draft; got: ${draftStatuses.join(',') || 'none'}`).toBe(true)

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 90_000 })
  })
})
