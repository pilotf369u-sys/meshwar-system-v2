import {test,expect} from '@playwright/test';
import {installMocks,openVendor,frameWindow} from './helpers.mjs';
test('general login replaces store A session with store B before entering the merchant host',async({page})=>{
 await page.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'text/javascript',body:'window.tailwind={config:{}}'}));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',r=>r.fulfill({contentType:'text/javascript',body:`export function createClient(){return {rpc:async(name,args)=>name==='login_role_resolver_v299'?{data:{ok:true,role:'vendor',roles:['vendor']}}:name==='vendor_login_session'?{data:{store:{id:args.p_identity,store_name:args.p_identity},session_token:'token-'+args.p_identity,expires_at:'2099-01-01'}}:{data:{}}}}`}));
 // Keep the destination inert so this test isolates the general login handoff.
 await page.route('**/vendor-dashboard.html',r=>r.fulfill({contentType:'text/html',body:'<p>merchant host destination</p>'}));
 for(const id of ['store-a','store-b']){
  await page.goto('/login.html');
  await page.locator('#phone').fill(id);await page.locator('#password').fill('synthetic-password');
  await page.locator('#loginSubmitBtn').click();await expect(page).toHaveURL(/vendor-dashboard\.html$/);
  expect(await page.evaluate(()=>({store:JSON.parse(sessionStorage.getItem('meshwar_vendor_store')),session:JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95'))}))).toMatchObject({store:{id},session:{token:'token-'+id,storeId:id}});
 }
});
test('direct old merchant V2 URL redirects to the supported host and renders its active modules',async({page})=>{
 await installMocks(page);
 await page.addInitScript(()=>sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'e2e-secure-token',expiresAt:'2099-01-01'})));
 await page.goto('/vendor-dashboard-v2.html?v=20261011-v167-growth');
 await expect(page).toHaveURL(/vendor-dashboard\.html\?v=20261011-v167-growth$/);
 await expect(page.frameLocator('#vendorFrame').locator('#dashboardView')).toBeVisible();
 await expect.poll(()=>frameWindow(page,()=>Boolean(window.MeshwarVendorV94))).toBe(true);
});
test('old barcode-only host redirects to the supported merchant host',async({page})=>{
 await installMocks(page);
 await page.addInitScript(()=>sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'e2e-secure-token',expiresAt:'2099-01-01'})));
 await page.goto('/vendor-dashboard-barcode-shell.html');
 await expect(page).toHaveURL(/vendor-dashboard\.html$/);
 await expect(page.frameLocator('#vendorFrame').locator('#dashboardView')).toBeVisible();
});

