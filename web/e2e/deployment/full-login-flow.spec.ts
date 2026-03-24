import { expect, test } from '@playwright/test'

test('full login flow with data requests', async ({ page }) => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://dify-web-development.up.railway.app'

  // Intercept and log network requests
  const requestsLog: { method: string, url: string, status?: number }[] = []

  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/console/api/') || url.includes('/signin') || url.includes('/apps')) {
      requestsLog.push({
        method: response.request().method(),
        url,
        status: response.status(),
      })
    }
  })

  // Navigate to signin
  await page.goto(`${baseUrl}/signin`)
  await page.waitForLoadState('networkidle')

  // Check the page content (for debugging if needed)
  const _signInHeading = page.locator('h1, h2, [role="heading"]').first()
  // const headingText = await _signInHeading.textContent().catch(() => 'NOT FOUND')

  // Check if login form is present
  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input[type="password"]')
  const loginButton = page.locator('button').filter({ hasText: /Sign in|Login|登录/ }).first()

  await expect(emailInput).toBeVisible({ timeout: 5000 })
  await expect(passwordInput).toBeVisible({ timeout: 5000 })
  await expect(loginButton).toBeVisible({ timeout: 5000 })

  // Use the correct credentials
  const email = 'railway-admin@example.com'
  const password = 'Adminrail2026'

  // Fill in credentials
  await emailInput.fill(email)
  await passwordInput.fill(password)

  // Click login
  await loginButton.click()

  // Wait a bit for the login request to be sent
  await page.waitForTimeout(2000)

  // Check current URL
  const currentUrl = page.url()

  // Check for error message
  const errorElements = await page.locator('[role="alert"], .error, .text-red, [class*="error"]').all()
  for (const elem of errorElements) {
    const text = await elem.textContent()
    if (text && text.trim()) {
      console.error('Error element:', text)
    }
  }

  // Try waiting for navigation with longer timeout
  try {
    await page.waitForURL(/\/(apps|dashboard|workspaces)/, { timeout: 20000 })
    console.warn('Navigation successful to:', page.url())
  }
  catch (e) {
    console.error('Navigation failed, current URL:', currentUrl)
    console.error('Final URL:', page.url())
    console.warn('All requests:', JSON.stringify(requestsLog, null, 2))
    throw e
  }

  await page.waitForLoadState('networkidle')
})
