import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const source=fs.readFileSync('js/staff-customer-receipt-badges.js','utf8');
for(const role of ['employee','admin','branch'])test(`${role} receipt badge preserves warning, gift and unsaved fields`,async({page})=>{
 await page.setViewportSize(role==='admin'?{width:390,height:844}:{width:1100,height:800});
 await page.setContent('<table style="width:100px"><tbody><tr><td><div data-customer-receipt-order="confirmed"></div><div data-stock-icon-slot="confirmed"><span style="display:inline-flex;align-items:center;gap:2px"><button style="border:0;background:transparent" id="warning" title="تغيّر الطلب — فتح الفاتورة">⚠</button><span id="gift" title="طلب عروض" tabindex="0">🎁</span></span></div><select id="status"><option>تم التسليم</option></select></td></tr></tbody></table><div data-customer-receipt-order="delivered-only"></div><input id="price" value="218000">');
 await page.evaluate(({role,source})=>{
  window.sessionToken='session-a';window.calls=[];window.failReceipt=false;window.warningClicks=0;document.getElementById('warning').onclick=()=>window.warningClicks++;
  const session={read:()=>({token:sessionToken})};
  window.KintoEmployeeSessionV143=window.KintoAdminSessionV147=window.KintoBranchSessionV148=session;
  const client={rpc:async(name,args)=>{calls.push({name,args});return failReceipt?{error:{message:'unavailable'}}:{data:[{order_id:'confirmed',confirmed_at:'2026-10-21T00:00:00Z'}]}}};
  window.ensureEmployeeSupabase=window.ensureCustomerSupabase=window.getSb=async()=>client;
  window.setInterval=fn=>{window.refreshReceipt=fn;return 1};
  const script=document.createElement('script');script.dataset.receiptRole=role;script.textContent=source;document.body.appendChild(script);
 },{role,source});
 await expect(page.locator('.customer-receipt-confirmed')).toHaveCount(1);
 await expect(page.locator('[data-customer-receipt-order="delivered-only"]')).toBeEmpty();
 await expect(page.locator('.customer-receipt-confirmed')).toHaveText('✓');
 const alignment=await page.evaluate(()=>{
  const nodes=['.customer-receipt-confirmed','#warning','#gift'].map(s=>document.querySelector(s));
  const r=nodes.map(n=>n.getBoundingClientRect());
  return {sameStrip:nodes.every(n=>n.closest('.kinto-order-indicators')===nodes[0].closest('.kinto-order-indicators')),centres:r.map(b=>b.y+b.height/2),width:document.querySelector('.kinto-order-indicators').getBoundingClientRect().width};
 });
 expect(alignment.sameStrip).toBe(true);expect(Math.max(...alignment.centres)-Math.min(...alignment.centres)).toBeLessThan(3);expect(alignment.width).toBeLessThan(100);
 await page.locator('.customer-receipt-confirmed').click();
 await expect(page.getByRole('tooltip')).toContainText('أكّد العميل');
 await page.locator('#gift').click();await expect(page.getByRole('tooltip')).toHaveText('طلب عروض');
 await page.locator('#warning').click();expect(await page.evaluate(()=>warningClicks)).toBe(1);
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);

 await page.locator('#price').fill('999');
 // Same IDs in newly rendered rows should receive cached proof without repeated RPC calls.
 await page.evaluate(()=>{document.querySelector('[data-customer-receipt-order="confirmed"]').replaceChildren();document.body.appendChild(document.createElement('aside'))});
 await expect(page.locator('.customer-receipt-confirmed')).toHaveCount(1);
 await expect(page.locator('#price')).toHaveValue('999');
 await expect(page.locator('#warning')).toHaveText('⚠');await expect(page.locator('#gift')).toHaveText('🎁');
 expect(await page.evaluate(()=>calls.length)).toBe(1);
 expect(await page.evaluate(()=>calls[0].args.p_role)).toBe(role);
 // A different session cannot retain the previous account's proof if verification fails.
 await page.evaluate(()=>{window.sessionToken='session-b';window.failReceipt=true;window.refreshReceipt()});
 await expect(page.locator('.customer-receipt-confirmed')).toHaveCount(0);
 await expect(page.locator('#price')).toHaveValue('999');
});
test('receipt lookups batch at 100 and do not write order data',async({page})=>{
 await page.setContent('<main></main>');
 await page.evaluate(source=>{
  window.calls=[];window.KintoBranchSessionV148={read:()=>({token:'branch-session'})};
  window.getSb=async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:[]}}});
  document.querySelector('main').innerHTML=Array.from({length:201},(_,i)=>`<div data-customer-receipt-order="order-${i}"></div>`).join('');
  const script=document.createElement('script');script.dataset.receiptRole='branch';script.textContent=source;document.body.appendChild(script);
 },source);
 await expect.poll(()=>page.evaluate(()=>calls.length)).toBe(3);
 expect(await page.evaluate(()=>calls.map(c=>c.args.p_order_ids.length))).toEqual([100,100,1]);
 expect(await page.evaluate(()=>calls.every(c=>c.name==='staff_customer_receipts_v1'))).toBe(true);
});
