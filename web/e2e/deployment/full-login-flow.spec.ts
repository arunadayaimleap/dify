import { expect, test } from '@playwright/test'

test('full login flow with data requests', async ({ page }) => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://dify-web-development.up.railway.app'

  // Navigate to signin (wait for form after global loading overlay)
  await page.goto(`${baseUrl}/signin`, { waitUntil: 'domcontentloaded' })

  const emailInput = page.locator('#email')
  const passwordInput = page.locator('#password')
  await expect(emailInput).toBeVisible({ timeout: 120_000 })
  await expect(passwordInput).toBeVisible({ timeout: 30_000 })

  const loginButton = page.getByRole('button', { name: /sign in|login|登录/i }).first()
  await expect(loginButton).toBeVisible({ timeout: 15_000 })

  // Use the correct credentials
  const email = 'railway-admin@example.com'
  const password = 'Adminrail2026'

  // Fill in credentials
  await emailInput.fill(email)
  await passwordInput.fill(password)

  // Click login and wait for post-auth route
  await loginButton.click()

  await page.waitForURL(/\/(apps|install|dashboard|workspaces)/, { timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
})
