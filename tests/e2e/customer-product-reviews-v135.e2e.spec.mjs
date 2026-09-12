import { test, expect } from '@playwright/test';
import { installMocks } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await installMocks(page);
});

test('customer reviews UI is isolated, responsive, and exposes camera plus device inputs', async ({ page }) => {
  await page.goto('/dashboard.html?customerId=e2e-customer');
  await expect(page.locator('#customerCode')).toHaveText('CUS-E2E');

  const tab = page.locator('.review-tab-btn');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator('#productReviews')).toHaveClass(/active/);
  await expect(page.locator('#reviewUnlock')).toBeVisible();

  await page.locator('#reviewPassword').fill('e2e-password');
  await page.locator('#reviewUnlockBtn').click();
  await expect(page.locator('.review-product-card')).toContainText('Test Product 01');
  await expect(page.locator('#reviewReadyBadge')).toHaveText('1');
  const rpcCalls = await page.evaluate(() => window.__MESH_E2E_RPC_CALLS || []);
  expect(rpcCalls.some(call => call.name === 'customer_review_ready_products_v132' && call.args?.p_session_token === 'e2e-review-token')).toBeTruthy();

  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('accept', 'image/*');
  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#reviewFilesInput')).toHaveAttribute('multiple', '');
  await expect(page.locator('#reviewFilesInput')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.reviews-panel-card')).toBeVisible();
  await expect(page.locator('#reviewUnlockForm')).toBeVisible();
  await expect(page.locator('#reviewUnlockBtn')).toBeVisible();
});
