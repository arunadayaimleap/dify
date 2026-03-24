import { expect, test } from '@playwright/test'

test('signin data-api-prefix is same-origin safe (split web/API)', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'Set PLAYWRIGHT_BASE_URL to your web origin (e.g. https://dify-web-….up.railway.app)')

  await page.goto('/signin', { waitUntil: 'domcontentloaded' })

  const prefix = await page.locator('body').getAttribute('data-api-prefix')
  expect(prefix, 'body should expose data-api-prefix from server env').toBeTruthy()

  const pageHost = new URL(baseURL!).host

  if (prefix!.startsWith('http')) {
    const apiHost = new URL(prefix!).host
    expect(
      apiHost,
      `API host (${apiHost}) must match web host (${pageHost}) or browsers will not send httpOnly session cookies. On Railway: set INTERNAL_API_ORIGIN on the web service (see docs/en-US/railway-deployment.md), or set NEXT_PUBLIC_API_PREFIX=/console/api and ensure INTERNAL_API_ORIGIN is set for the proxy.`,
    ).toBe(pageHost)
  }
  else {
    expect(prefix).toMatch(/^\/console\/api\/?$/)
  }
})
