import { test, expect } from '@playwright/test';
import { installMocks } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await installMocks(page);
  await page.goto('/login.html');
  await page.evaluate(() => {
    document.body.innerHTML = `
      <nav class="tabs-nav">
        <button class="tab-btn" data-tab="orders">طلباتي</button>
        <button class="tab-btn" data-tab="notifications">الإشعارات</button>
        <button class="tab-btn" data-tab="drafts">المسودات</button>
      </nav>
      <section id="notifications" class="tab-panel"><div class="panel-head"></div><div id="notificationsContainer"></div></section>
      <section id="drafts" class="tab-panel"></section>
    `;
    sessionStorage.setItem('kinto_customer_review_session_v132', JSON.stringify({
      token: 'e2e-review-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }));
  });
  await page.addScriptTag({ url: '/js/customer-product-reviews-v135.js' });
  await page.waitForFunction(() =>
    window.KintoCustomerReviewsV135?.version === 'v135' &&
    document.querySelector('.review-tab-btn') &&
    document.getElementById('productReviews')
  );
});

test('production reviews script injects UI and calls the secure ready-products RPC', async ({ page }) => {
  await expect(page.locator('.review-tab-btn')).toBeVisible();
  await expect(page.locator('#productReviews')).toBeAttached();
  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('accept', 'image/*');
  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#reviewFilesInput')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  await expect(page.locator('#reviewFilesInput')).not.toHaveAttribute('multiple', '');

  const diagnostics = await page.evaluate(() => window.KintoCustomerReviewsV135.diagnostics());
  expect(diagnostics?.ok).toBeTruthy();

  const rpcCalls = await page.evaluate(() => window.__MESH_E2E_RPC_CALLS || []);
  expect(rpcCalls.some(call =>
    call.name === 'customer_review_ready_products_v132' &&
    call.args?.p_session_token === 'e2e-review-token'
  )).toBeTruthy();

  await page.locator('.review-tab-btn').click();
  await expect(page.locator('#productReviews')).toHaveClass(/active/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.reviews-panel-card')).toBeVisible();
});

test('production reviews script blocks review submission in staff customer read-only mode', async ({ page }) => {
  await page.evaluate(() => { window.KINTO_STAFF_CUSTOMER_READ_ONLY = true; });

  const before = await page.evaluate(() => (window.__MESH_E2E_RPC_CALLS || []).filter(
    call => call.name === 'customer_submit_product_review_v132'
  ).length);

  await page.evaluate(() => {
    const form = document.getElementById('productReviewForm');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  const after = await page.evaluate(() => (window.__MESH_E2E_RPC_CALLS || []).filter(
    call => call.name === 'customer_submit_product_review_v132'
  ).length);

  expect(after).toBe(before);
  await expect(page.locator('#reviewFormMessage')).toContainText('وضع مشاهدة فقط');
});
