import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const helper=fs.readFileSync('js/kinto-coupon-finance-v1.js','utf8');
function extract(file,name){const s=fs.readFileSync(file,'utf8'),start=s.indexOf('function '+name+'(');if(start<0)throw Error(name);if(name.endsWith('Snapshot'))return s.slice(start).split('\n')[0];const end=s.indexOf('}',start);return s.slice(start,end+1)}
for(const [file,name]of [['employee-dashboard.html','doorCollectionAmount'],['admin-dashboard.html','doorCollection'],['branch-dashboard.html','doorCollection'],['delivery-dashboard.html','doorCollection'],['admin-branch-reports.html','doorCollection'],['admin-delivery-reports.html','doorCollection']])test(`${file} coupon collection preserves original price and shipping`,async({page})=>{
 await page.setContent('<output id="amount"></output>');await page.addScriptTag({content:helper});
 if(file==='branch-dashboard.html')await page.addScriptTag({content:fs.readFileSync('js/branch-collection-display-v1.js','utf8')});
 await page.addScriptTag({content:'function payType(v){return v}function paymentType(v){return v}function deliveryPayType(v){return v}'+extract(file,name)});
 const values=await page.evaluate(name=>{
  const o={total_price:46000,currency:'IQD',reward_discount_amount:3000,reward_discount_currency:'IQD',delivery_fee:5000,delivery_payment_type:'cod_full'};
  return [window[name](o),o.total_price,window[name]({...o,delivery_payment_type:'paid_prepaid'}),window[name]({...o,delivery_payment_type:'product_paid_delivery_cod'}),window[name]({...o,reward_discount_amount:0}),window[name]({...o,reward_discount_currency:'USD'})];
 },name);expect(values).toEqual([48000,46000,0,5000,51000,51000]);
});
for(const role of ['employee','admin'])test(`${role} native shipping controller uses coupon and retains external fee`,async({page})=>{
 await page.setContent('<div></div>');await page.addScriptTag({content:helper});
 await page.evaluate(({source,role})=>{const s=document.createElement('script');s.dataset.meshwarScreen=role;s.textContent=source;document.head.append(s)},{source:fs.readFileSync('js/external-shipping-native-order-render-v1.js','utf8'),role});
 expect(await page.evaluate(role=>window[role==='employee'?'doorCollectionAmount':'doorCollection']({total_price:46000,currency:'IQD',reward_discount_amount:3000,reward_discount_currency:'IQD',external_shipping_fee:2000,delivery_fee:5000,delivery_payment_type:'cod_full'}),role)).toBe(50000);
});
for(const role of ['admin','vendor'])test(`${role} finance shows funded coupon breakdown and agreed commission`,async({page})=>{
 await page.setContent('<table><tbody id="'+(role==='admin'?'adminVendorFinanceBody':'vendorFinanceBody')+'"></tbody></table>');await page.addScriptTag({content:helper});
 const file=role==='admin'?'admin-dashboard.html':'vendor-dashboard-v2.html',name=role==='admin'?'adminVendorFinanceSnapshot':'vendorFinanceSnapshot';
 await page.addScriptTag({content:`function parseAdminOrderDetails(x){return x}function normalizeOrderDetails(x){return x}function adminVendorFinanceRate(o){return o.details.commission_rate}function adminVendorFinanceOther(o){return o.details.vendor_other_deductions}function adminVendorFinanceStatus(){return 'pending'}function adminVendorStoreForOrder(){return null}function orderCommissionRate(){return 10}function vendorFinanceOther(){return 0}function vendorFinancePaymentStatus(){return 'pending'}`+extract(file,name)});
 const result=await page.evaluate(role=>{
  const snap={coupon_finance_version:'v1',original_goods_amount:46000,vendor_coupon_discount:3000,kinto_coupon_discount:0,customer_goods_amount:43000,gross_amount:43000,commission_rate:10,commission_amount:4300,other_deductions:0,net_amount:38700};
  const order={total_price:role==='admin'?snap.gross_amount:46000,details:{vendor_finance_snapshot:snap,commission_rate:10,vendor_other_deductions:0}};
  const r=window[role==='admin'?'adminVendorFinanceSnapshot':'vendorFinanceSnapshot'](order);
  return {total:r.total,commission:r.commission,net:r.net,html:KintoCouponFinanceV1.breakdown(snap,(v)=>Number(v).toLocaleString('en-US'),'IQD')};
 },role);expect(result).toMatchObject({total:43000,commission:4300,net:38700});expect(result.html).toContain('46,000');expect(result.html).toContain('كوبون التاجر: 3,000');expect(result.html).toContain('أساس العمولة: 43,000');
});
for(const role of ['branch','delivery','manifest'])test(`${role} external shipping override retains coupon collection`,async({page})=>{
 await page.setContent('<div></div>');await page.addScriptTag({content:helper});
 await page.evaluate(()=>{window.doorCollection=()=>0;window.netCustody=()=>0;window.deliveryNet=()=>0});
 await page.evaluate(({source,role})=>{const s=document.createElement('script');s.dataset.meshwarScreen=role;s.textContent=source;document.head.append(s)},{source:fs.readFileSync('js/external-shipping-fee-v2.js','utf8'),role});
 expect(await page.evaluate(()=>doorCollection({total_price:46000,currency:'IQD',reward_discount_amount:3000,reward_discount_currency:'IQD',external_shipping_fee:2000,delivery_fee:5000,delivery_payment_type:'cod_full'}))).toBe(50000);
});
