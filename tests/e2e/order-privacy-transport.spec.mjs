import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const orderSource=fs.readFileSync('js/kinto-order-data-session-v1.js','utf8'),productSource=fs.readFileSync('js/kinto-vendor-products-v1.js','utf8');
async function boot(page,role){
 await page.goto('/');
 await page.evaluate(()=>{
  window.calls=[];window.pollRows=[{id:'own',status:'مندوب'}];window.changes=0;
  window.fetch=async(input,init)=>{const req=new Request(input,init);window.calls.push({url:req.url,method:req.method,role:req.headers.get('x-kinto-role'),token:req.headers.get('x-kinto-session'),body:req.method==='POST'?await req.json():null});return new Response(JSON.stringify(window.pollRows),{status:200,headers:{'Content-Type':'application/json','Content-Range':'0-0/1'}})};
  sessionStorage.setItem('kinto_customer_review_session_v132',JSON.stringify({token:'customer-token',expiresAt:'2099-01-01'}));sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'vendor-token',expiresAt:'2099-01-01'}));
 });
 await page.addScriptTag({content:`document.currentScript.dataset.role=${JSON.stringify(role)};\n`+orderSource});
}
test('customer transport binds the current session, preserves filters, and never sends session headers to another origin',async({page})=>{
 await boot(page,'customer');
 const result=await page.evaluate(async()=>{
  await KintoOrderDataSessionV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/orders?customer_id=eq.other&select=id');
  await KintoOrderDataSessionV1.fetch('https://example.test/rest/v1/orders');
  sessionStorage.removeItem('kinto_customer_review_session_v132');const response=await KintoOrderDataSessionV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/orders');return {calls:window.calls,status:response.status};
 });
 expect(result.calls[0]).toMatchObject({role:'customer',token:'customer-token',method:'GET'});expect(result.calls[0].url).toContain('customer_id=eq.other');expect(result.calls[1].token).toBeNull();expect(result.calls).toHaveLength(2);expect(result.status).toBe(401);
});
test('vendor product and order reads use scoped RPC bodies and retain PostgREST filtering and exact counts',async({page})=>{
 await boot(page,'vendor');await page.addScriptTag({content:productSource});
 const result=await page.evaluate(async()=>{
  const r=await KintoOrderDataSessionV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/orders?select=id&limit=1',{headers:{Prefer:'count=exact'}});
  await KintoVendorProductsV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/local_products?select=id,cost_price&store_id=eq.foreign&limit=1');return {calls:window.calls,count:r.headers.get('Content-Range')};
 });
 expect(result.calls[0]).toMatchObject({method:'POST',body:{p_session_token:'vendor-token'}});expect(result.calls[0].url).toContain('/rpc/kinto_vendor_orders_read_session_v1?select=id&limit=1');
 expect(result.calls[1].url).toContain('/rpc/kinto_vendor_products_read_session_v1?select=id,cost_price&store_id=eq.foreign&limit=1');expect(result.calls[1].url).not.toContain('vendor-token');expect(result.count).toBe('0-0/1');
});
test('session polling skips identical rows and active edits, then refreshes on a real change',async({page})=>{
 await boot(page,'customer');await page.clock.install();
 await page.evaluate(()=>KintoOrderDataSessionV1.watch(window,()=>{window.changes++}));await expect.poll(()=>page.evaluate(()=>window.calls.length)).toBeGreaterThan(0);
 await page.clock.runFor(5000);expect(await page.evaluate(()=>window.changes)).toBe(0);
 await page.evaluate(()=>{document.body.innerHTML='<input id="editing">';document.getElementById('editing').focus();window.pollRows=[{id:'own',status:'تم التسليم'}]});
 await page.clock.runFor(5000);expect(await page.evaluate(()=>window.changes)).toBe(0);
 await page.evaluate(()=>document.getElementById('editing').blur());await page.clock.runFor(5000);await expect.poll(()=>page.evaluate(()=>window.changes)).toBe(1);
 await page.clock.runFor(5000);expect(await page.evaluate(()=>window.changes)).toBe(1);
});
