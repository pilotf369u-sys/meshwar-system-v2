import {test,expect} from '@playwright/test';
import {installMocks,openVendor} from './helpers.mjs';

test('saved merchant order filter waits for delayed adapter on open and refresh',async({page})=>{
 await installMocks(page);
 await page.context().addInitScript(()=>{
  localStorage.setItem('meshwar_vendor_active_tab','vendorTabBtn-orders');
  localStorage.setItem('meshwar_vendor_order_filter','delivery');
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/js/vendor-v94-multistore-orders.js?*',async route=>{
  await new Promise(resolve=>setTimeout(resolve,1500));await route.continue();
 });
 const frame=await openVendor(page);
 await expect(frame.locator('[data-order-filter="delivery"]')).toHaveClass(/active/);
 await expect(frame.locator('#ordersBody')).toContainText('قيد التوصيل');
 expect(errors).toEqual([]);
 await page.reload();
 await expect(frame.locator('#dashboardView')).toBeVisible();
 await expect(frame.locator('[data-order-filter="delivery"]')).toHaveClass(/active/);
 await expect(frame.locator('#ordersBody')).toContainText('قيد التوصيل');
 expect(errors).toEqual([]);
});
