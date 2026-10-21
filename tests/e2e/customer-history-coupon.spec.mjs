import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const pageSource=fs.readFileSync('dashboard.html','utf8');
const start=pageSource.indexOf('function customerHistoryMoneyHtml('),end=pageSource.indexOf('\nfunction decorateMobileCustomerDecisionCells',start);
const source=pageSource.slice(start,end);
for(const mobile of [false,true])test(`customer history matches invoice discounts (${mobile?'mobile':'desktop'})`,async({page})=>{
 if(mobile)await page.setViewportSize({width:393,height:851});
 await page.setContent('<table><tbody id="history"></tbody></table>');
 await page.addScriptTag({content:`function escapeHtml(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function orderStatusStyle(){return ['white','black']}function getOrderQuantity(){return 1}function getOrderParcelsCount(){return 1}function getOrderSiparisNo(){return ''}function siparisDisplayHtml(){return ''}`});
 await page.addScriptTag({content:fs.readFileSync('js/kinto-bundle-ui-v93.js','utf8')});await page.addScriptTag({content:source});
 const order={id:'history-coupon',order_code:'KN-000117',status:'تم التسليم',total_price:46000,currency:'IQD',reward_discount_amount:3000,reward_discount_currency:'IQD',delivery_fee:0,external_shipping_fee:0};
 async function render(o){return page.evaluate(o=>{document.querySelector('#history').innerHTML=historyOrderRow(o,0);return {totals:KintoBundleV93.totals(o),price:o.total_price}},o)}
 const r=await render(order);expect(r.price).toBe(46000);expect(r.totals.grand).toBe(43000);
 const cell=page.locator('#history tr td').nth(5);await expect(cell.locator('del')).toHaveText('46000.00 IQD');await expect(cell.locator('b')).toHaveText('43000.00 IQD');await expect(cell).toContainText('بعد الخصم');await expect(page.locator('button')).toHaveCount(2);
 await render({...order,delivery_fee:5000});await expect(cell.locator('b')).toHaveText('48000.00 IQD');await expect(cell.locator('del')).toHaveText('51000.00 IQD');
 await render({...order,reward_discount_amount:0});await expect(cell.locator('b')).toHaveText('46000.00 IQD');await expect(cell.locator('del')).toHaveCount(0);
 await render({...order,reward_discount_currency:'USD'});await expect(cell.locator('b')).toHaveText('46000.00 IQD');await expect(cell.locator('del')).toHaveCount(0);
 await render({...order,delivery_fee:5,delivery_currency:'USD',shipping_company_name:'Delivery',shipping_snapshot:{currency:'USD'}});await expect(cell.locator('b')).toHaveText('43000.00 IQD');await expect(cell).toContainText('+ 5.00 USD توصيل');
 await render({...order,status:'ملغي من قبل العميل'});await expect(cell).not.toContainText('مدفوع');await expect(page.locator('button')).toHaveCount(1);
 await render({...order,total_price:null});await expect(cell).toHaveText('---');
});
