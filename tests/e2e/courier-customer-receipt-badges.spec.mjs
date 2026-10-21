import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const html=fs.readFileSync('delivery-dashboard.html','utf8');
const names=['esc','idText','parseDetails','deliveryPayType','money','doorCollection','deliveryNet','deliveryCollectionBadge','toggleShipmentCard','renderOrderCard'];
const functions=names.map(name=>html.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n');
const source=fs.readFileSync('js/staff-customer-receipt-badges.js','utf8');
for(const mobile of [false,true])test('courier actual card receipt click preserves expansion, collection and edits '+mobile,async({page})=>{
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1200,height:900});
 await page.setContent('<main id="cards"></main>');
 await page.evaluate(()=>{
  Object.assign(window,{deliveryTab:'delivered',DELIVERY_TABS:{rejected:['رفض التسليم']},
   phoneDigits:v=>String(v||''),customerFullAddress:()=> 'العنوان التجريبي',
   deliveryOrderQuantity:()=>3,deliveryParcelsCount:()=>1,parcelImageUrl:()=>'',deliveryProofUrl:()=>'',
   statusOptions:()=>'<option>تم التسليم</option><option>رفض التسليم</option>',
   KintoCouponFinanceV1:{goods:o=>Number(o.total_price)-Number(o.reward_discount_amount||0)},
   KintoCourierSessionV149:{read:()=>({token:'courier-test'})}
  });
  window.calls=[];
  window.getDeliverySb=async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_order_ids.includes('confirmed')?[{order_id:'confirmed',confirmed_at:'2026-10-21'}]:[]}}});
 });
 await page.addScriptTag({content:functions});
 await page.evaluate(()=>{
  const order={id:'confirmed',order_code:'KN-CONFIRMED',status:'تم التسليم',total_price:218000,reward_discount_amount:1000,delivery_fee:5000,delivery_payment_type:'product_paid_delivery_cod',currency:'IQD',details:{}};
  document.getElementById('cards').innerHTML=renderOrderCard(order)+renderOrderCard({...order,id:'delivered-only'});
 });
 await page.evaluate(source=>{const script=document.createElement('script');script.dataset.receiptRole='courier';script.textContent=source;document.body.appendChild(script)},source);
 const card=page.locator('.shipment[data-id="confirmed"]');
 await expect(card.locator('.customer-receipt-confirmed')).toBeVisible();
 await expect(page.locator('.shipment[data-id="delivered-only"] .customer-receipt-confirmed')).toHaveCount(0);
 await card.locator('#note-confirmed').fill('ملاحظة غير محفوظة');
 await expect(card.locator('.shipment-summary .money')).toHaveText('5000.00 IQD');
 await card.locator('.customer-receipt-confirmed').click();
 await expect(page.getByRole('tooltip')).toContainText('أكّد العميل');
 await expect(card).not.toHaveClass(/open/);
 await expect(card.locator('#note-confirmed')).toHaveValue('ملاحظة غير محفوظة');
 await card.locator('.code').click();await expect(card).toHaveClass(/open/);
 await card.locator('.customer-receipt-confirmed').click();await expect(card).toHaveClass(/open/);
 await expect(card.locator('.shipment-summary .money')).toHaveText('5000.00 IQD');
 expect(await page.evaluate(()=>calls.every(c=>c.name==='courier_customer_receipts_v1'&&!('p_role' in c.args)))).toBe(true);
 expect(await page.evaluate(()=>document.querySelectorAll('button').length>0&&![...document.querySelectorAll('button')].some(b=>b.textContent.includes('الفاتورة')))).toBe(true);
});
