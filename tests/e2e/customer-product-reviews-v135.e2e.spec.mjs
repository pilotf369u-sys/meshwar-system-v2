import { test, expect } from '@playwright/test';
import { installMocks } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await installMocks(page);
});

test('customer reviews UI is isolated, responsive, and exposes camera plus device inputs', async ({ page }) => {
  await page.goto('/dashboard.html?customerId=e2e-customer');

  const tab = page.locator('.review-tab-btn');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator('#productReviews')).toHaveClass(/active/);
  await expect(page.locator('#reviewUnlock')).toBeVisible();

  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('accept', 'image/*');
  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#reviewFilesInput')).toHaveAttribute('multiple', '');
  await expect(page.locator('#reviewFilesInput')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.reviews-panel-card')).toBeVisible();
  await expect(page.locator('#reviewUnlockForm')).toBeVisible();
  await expect(page.locator('#reviewUnlockBtn')).toBeVisible();
});
