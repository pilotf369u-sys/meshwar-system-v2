import { test, expect } from '@playwright/test';
import { installMocks, openVendor, frameWindow } from './helpers.mjs';
test('lifetime cards include archives, remain separate from current finance and refresh without flashing',async({page})=>{
 await installMocks(page);
 await page.addInitScript(()=>sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'e2e-secure-token',expiresAt:new Date(Date.now()+3600000).toISOString()})));
 await page.addInitScript(()=>window.addEventListener('kinto-vendor-runtime-ready',()=>{
  window.__E2E_DASHBOARD_SUMMARY_V166={currencies:[{currency:'IQD',orders:2,incomplete_orders:0,invalid_financial_orders:0,sales:327000,commission:32700,pending:0,paid:294300,profit:70175}]};
 }));
 const vendor=await openVendor(page);
 await expect(vendor.locator('#statSales')).toHaveText('327,000 IQD');
 await expect(vendor.locator('#statCommission')).toHaveText('32,700 IQD');
 await expect(vendor.locator('#statPending')).toHaveText('0 IQD');
 await expect(vendor.locator('#statPaid')).toHaveText('294,300 IQD');
 await expect(vendor.locator('#statProfit')).toHaveText('70,175 IQD');
 await expect(vendor.locator('[data-mw-kpi-icon]')).toHaveCount(5);
 await expect(vendor.locator('#statCommission').locator('..')).toContainText('KINTO');
 await vendor.locator('#vendorTabBtn-finance').click();
 await expect(vendor.locator('#vendorFinanceBody')).toContainText('لا توجد حركات مالية');
 await expect(vendor.locator('#statSales')).toHaveText('327,000 IQD');
 await frameWindow(page,()=>{
  const value=document.getElementById('statProfit');window.__summaryChanges=0;
  new MutationObserver(()=>window.__summaryChanges++).observe(value,{childList:true,subtree:true});
 });
 await frameWindow(page,()=>window.KintoVendorSummaryV166.refresh());
 expect(await frameWindow(page,()=>window.__summaryChanges)).toBe(0);
 await frameWindow(page,()=>{
  window.__E2E_DASHBOARD_SUMMARY_V166.currencies[0].profit=69175;
  window.dispatchEvent(new Event('kinto:vendor-finance-changed'));
 });
 await expect(vendor.locator('#statProfit')).toHaveText('69,175 IQD');
 await frameWindow(page,()=>{
  window.__E2E_DASHBOARD_SUMMARY_V166.currencies[0].incomplete_orders=1;
  window.__E2E_DASHBOARD_SUMMARY_V166.currencies[0].profit=22200;
  window.dispatchEvent(new Event('kinto:vendor-finance-changed'));
 });
 await expect(vendor.locator('#vendorSummaryNoteV166')).toContainText('1 طلب غير مكتمل خارج حساب الربح');
 await expect(vendor.locator('#statProfit')).toHaveText('22,200 IQD');
 await frameWindow(page,()=>{
  const old=window.MeshwarVendorRuntime.sb.rpc;
  window.MeshwarVendorRuntime.sb.rpc=async(n,a)=>n==='vendor_dashboard_summary_v166'?{error:{message:'RPC unavailable'}}:old(n,a);
  window.dispatchEvent(new Event('kinto:vendor-finance-changed'));
 });
 await expect(vendor.locator('#statSales')).toHaveText('—');
 await expect(vendor.locator('#vendorSummaryNoteV166')).toContainText('تعذر تحميل');
});
