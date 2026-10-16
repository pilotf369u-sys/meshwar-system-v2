import {test,expect} from '@playwright/test';
import {installMocks} from './helpers.mjs';
test('categories populate after a fresh secure vendor login, without reloading the page',async({page})=>{
 await installMocks(page);
 await page.context().addInitScript(()=>sessionStorage.removeItem('meshwar_vendor_store'));
 await page.goto('/vendor-dashboard.html');const vendor=page.frameLocator('#vendorFrame');
 await vendor.locator('#loginView').waitFor({state:'visible'});
 await expect.poll(()=>page.evaluate(()=>Boolean(document.getElementById('vendorFrame')?.contentWindow?.MeshwarVendorV94))).toBe(true);
 await vendor.locator('#vendorTabBtn-categories').waitFor({state:'attached'});
 await vendor.locator('#loginIdentity').fill('synthetic-vendor');await vendor.locator('#loginPassword').fill('synthetic-password');await vendor.locator('#loginBtn').click();
 await vendor.locator('#dashboardView').waitFor({state:'visible'});await vendor.locator('#vendorTabBtn-categories').click();
 await expect(vendor.locator('#mwCatList')).toContainText('Main A');
 await expect(vendor.locator('#mwProductMainCategory')).toContainText('Main A');
});
