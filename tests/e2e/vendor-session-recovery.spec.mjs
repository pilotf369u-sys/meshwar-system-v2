import {test,expect} from '@playwright/test';
import {installMocks,openVendor,frameWindow} from './helpers.mjs';
test('cached vendor store without secure session returns to login and restores products/orders after signing in',async({page})=>{
 await installMocks(page);
 await page.context().addInitScript(()=>sessionStorage.removeItem('meshwar_vendor_session_v95'));
 await page.goto('/vendor-dashboard.html');
 const vendor=page.frameLocator('#vendorFrame');
 await expect(vendor.locator('#loginView')).toBeVisible();
 await expect(vendor.locator('#dashboardView')).toBeHidden();
 await expect(vendor.locator('#loginNotice')).toContainText('جلسة المتجر');
 await expect.poll(()=>frameWindow(page,()=>Boolean(window.MeshwarVendorV94))).toBe(true);
 await vendor.locator('#loginIdentity').fill('synthetic-vendor');
 await vendor.locator('#loginPassword').fill('synthetic-password');
 await vendor.locator('#loginBtn').click();
 await expect(vendor.locator('#dashboardView')).toBeVisible();
 await expect.poll(()=>frameWindow(page,()=>window.MeshwarVendorRuntime.getOrders().length)).toBeGreaterThan(0);
 await vendor.locator('#vendorTabBtn-products').click();
 await expect(vendor.locator('#productsBody')).toContainText('Test Product');
 expect(await frameWindow(page,()=>Boolean(JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token))).toBe(true);
});
test('loss of session while dashboard is open returns to login instead of leaving empty order lists',async({page})=>{
 await installMocks(page);const vendor=await openVendor(page,{authenticated:true});
 await frameWindow(page,async()=>{sessionStorage.removeItem('meshwar_vendor_session_v95');await window.loadOrders()});
 await expect(vendor.locator('#loginView')).toBeVisible();
 await expect(vendor.locator('#dashboardView')).toBeHidden();
 await expect(vendor.locator('#loginNotice')).toContainText('جلسة المتجر');
});
