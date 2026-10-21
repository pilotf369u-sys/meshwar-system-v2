import {test,expect} from '@playwright/test';
import {installMocks,openVendor,frameWindow} from './helpers.mjs';
for(const segments of [false,true])test('vendor receipt badge in actual '+(segments?'segment':'legacy')+' rows',async({page})=>{
 await page.setViewportSize(segments?{width:390,height:844}:{width:1200,height:800});
 await installMocks(page);
 await page.addInitScript(()=>{window.__E2E_CUSTOMER_RECEIPT_IDS=['o-paid','global-e2e-1']});
 const frame=await openVendor(page,{authenticated:segments});
 await frameWindow(page,()=>{
  const rt=window.MeshwarVendorRuntime;
  rt.setOrders(rt.getOrders().filter(o=>['o-paid','o-unpaid','global-e2e-1'].includes(o._v95OrderId||o.id)).map(o=>o.id==='o-paid'?{...o,details:{...(typeof o.details==='string'?JSON.parse(o.details):o.details),deal_campaign_id:'receipt-test-campaign'}}:o));
  window.renderVendorOrders();window.MeshwarVendorOrderIndicatorsV66?.decorate();
 });
 await expect(frame.locator('[data-vendor-order-id="o-paid"] .customer-receipt-confirmed')).toHaveCount(1);
 await expect(frame.locator('[data-vendor-order-id="o-unpaid"] .customer-receipt-confirmed')).toHaveCount(0);
 if(segments)await expect(frame.locator('[data-vendor-order-id="global-e2e-1"] .customer-receipt-confirmed')).toHaveCount(1);
 await expect(frame.locator('[data-vendor-order-id="o-paid"] .kinto-order-indicators')).toContainText('🎁');
 await frame.locator('[data-vendor-order-id="o-paid"] .customer-receipt-confirmed').click();
 await expect(frame.getByRole('tooltip')).toContainText('أكّد العميل');
 const calls=await frameWindow(page,()=>window.__MESH_E2E_RPC_CALLS.filter(c=>c.name==='vendor_customer_receipts_v1'));
 expect(calls.length).toBeGreaterThan(0);
 expect(calls.every(c=>!c.args.p_order_ids.includes('seg-e2e-1')&&!('p_role' in c.args))).toBe(true);
 // Receipt updates leave an in-progress status choice untouched.
 await frameWindow(page,()=>{
  const select=document.querySelector('[data-vendor-segment-status]');
  if(select){select.value='تم الشحن';select.dataset.receiptTestValue=select.value}
  document.body.appendChild(document.createElement('aside'));
 });
 if(segments)await expect(frame.locator('[data-vendor-segment-status]').first()).toHaveValue('تم الشحن');
});
