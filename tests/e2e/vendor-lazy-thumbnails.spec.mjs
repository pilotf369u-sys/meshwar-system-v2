import { test, expect } from '@playwright/test';
import { installMocks, frameWindow } from './helpers.mjs';

test('slow product thumbnails do not block merchant startup and load when products are opened', async ({ page }) => {
  await installMocks(page);
  await page.addInitScript(() => {
    window.addEventListener('kinto-vendor-runtime-ready', () => {
      for (const product of window.__MESH_E2E_DB?.local_products || [])
        product.image_url = '/__slow-vendor-thumb.gif?id=' + product.id;
    }, { once: true });
  });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/__slow-vendor-thumb.gif?*', async route => {
    await held;
    await route.fulfill({
      status: 200, contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
    });
  });
  try {
    await page.goto('/vendor-dashboard.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#vendorBootLoader')).toHaveCount(0, { timeout: 10000 });
    const vendor = page.frameLocator('#vendorFrame');
    await expect(vendor.locator('#dashboardView')).toBeVisible();
    await expect(vendor.locator('#vendorOrderSmartSearch')).toBeAttached();
    await vendor.locator('#vendorTabBtn-products').click();
    const image = vendor.locator('#productsBody tr:not(.mw-page-hidden) img').first();
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('decoding', 'async');
    release();
    await expect(image).toBeVisible();
    await expect.poll(() => frameWindow(page, () => {
      const image = document.querySelector('#productsBody tr:not(.mw-page-hidden) img');
      return Boolean(image?.complete && image.naturalWidth > 0);
    })).toBe(true);
    await expect(vendor.locator('#productsBody tr:not(.mw-page-hidden) button').first()).toBeEnabled();
  } finally {
    release();
  }
});
