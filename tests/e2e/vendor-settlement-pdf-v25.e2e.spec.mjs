import { test, expect } from '@playwright/test';
import { installMocks, openVendor, frameWindow } from './helpers.mjs';

test('V25 settlement stores immutable order/expense details and prints them from snapshot',async({page})=>{
  await installMocks(page);page.on('dialog',d=>d.accept());
  const vendor=await openVendor(page);
  await frameWindow(page,()=>{
    const now=new Date().toISOString();
    for(const id of ['o-paid','o-unpaid']){const o=window.__MESH_E2E_DB.orders.find(x=>x.id===id);o.created_at=now;o.updated_at=now}
    const paid=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-paid'),unpaid=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-unpaid');paid.snapshot_cost_price=20;unpaid.snapshot_cost_price=25;
    window.__MESH_E2E_DB.vendor_operating_expenses=[{id:'expense-v25',store_id:'store-e2e-1',amount:25,currency:'USD',category:'إيجار',note:'Snapshot rent',expense_date:now.slice(0,10),created_at:now}];
  });
  await vendor.locator('#vendorTabBtn-pl').click();
  await expect(vendor.locator('#mwSettlementToolbar')).toBeVisible();
  await expect.poll(()=>frameWindow(page,()=>Boolean(window.__mwVendorSettlementPdfDetailsV25))).toBe(true);
  const today=await frameWindow(page,()=>new Date().toISOString().slice(0,10));
  await vendor.locator('#mwPlDateFrom').fill(today);await vendor.locator('#mwPlDateTo').fill(today);await vendor.locator('#mwPlApplyPeriod').click();
  await expect(vendor.locator('#mwPlSales')).toHaveText('300 USD');
  await vendor.locator('#mwPlClosePeriod').click();
  await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.financial_settlements?.length||0)).toBe(1);
  const snap=await frameWindow(page,()=>window.__MESH_E2E_DB.financial_settlements[0].snapshot);
  expect(snap.detail_version).toBe('20260824-1435');expect(snap.orders).toHaveLength(2);expect(snap.expenses).toHaveLength(1);
  expect(snap.orders.map(x=>x.order_code).sort()).toEqual(['MW-5666','MW-5667']);expect(snap.orders[0]).toHaveProperty('sales');expect(snap.orders[0]).toHaveProperty('cogs');expect(snap.orders[0]).toHaveProperty('profit');expect(snap.expenses[0].note).toBe('Snapshot rent');
  await frameWindow(page,()=>{const o=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-paid');o.total_price=9999;window.__MESH_E2E_DB.vendor_operating_expenses[0].note='MUTATED AFTER CLOSE';window.__E2E_SETTLEMENT_HTML='';window.__E2E_SETTLEMENT_CLOSED=false;window.open=()=>({document:{write:s=>{window.__E2E_SETTLEMENT_HTML+=String(s)},close:()=>{window.__E2E_SETTLEMENT_CLOSED=true}}})});
  await vendor.locator('[data-mw-settlement-print]').first().click();
  const printed=await frameWindow(page,()=>({html:window.__E2E_SETTLEMENT_HTML,closed:window.__E2E_SETTLEMENT_CLOSED}));
  expect(printed.closed).toBe(true);expect(printed.html).toContain('الطلبات المسلّمة الداخلة في الدورة');expect(printed.html).toContain('المصاريف التشغيلية الداخلة في الدورة');expect(printed.html).toContain('MW-5666');expect(printed.html).toContain('Snapshot rent');expect(printed.html).not.toContain('MUTATED AFTER CLOSE');expect(printed.html).not.toContain('9,999 USD');
});
