import { test, expect } from '@playwright/test';
import { installMocks, openVendor, frameWindow } from './helpers.mjs';

// Current archive PDF replaces the retired V25 period writer.
test('settlement archive PDF reads frozen amounts and branding after live data changes',async({page})=>{
  await installMocks(page);
  const vendor=await openVendor(page);
  await frameWindow(page,async()=>{
    sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'e2e-secure-token'}));
    window.__E2E_FROZEN_ARCHIVE={id:'archive-test',statement_no:'KINTO-STL-TEST',store_name_snapshot:'Test Store',store_logo_url_snapshot:'https://example.test/store-logo.png',platform_logo_url_snapshot:'https://example.test/platform-logo.png',currency:'IQD',created_at:'2026-10-10T00:00:00Z',gross_amount:123000,commission_amount:12300,other_deductions:0,net_amount:110700,order_count:1,segment_ids:[{order_code:'KN-000100',order_date:'2026-10-09T00:00:00Z',gross_amount:123000,commission_rate:10,commission_amount:12300,other_deductions:0,net_amount:110700,paid_at:'2026-10-10T00:00:00Z'}]};
    const original=window.MeshwarVendorRuntime.sb.rpc;
    window.MeshwarVendorRuntime.sb.rpc=async(name,args)=>name==='vendor_list_settlement_archives_v163'?{data:[structuredClone(window.__E2E_FROZEN_ARCHIVE)],error:null}:original(name,args);
    await window.KintoVendorArchiveV163.render();
    window.__MESH_E2E_DB.orders[0].total_price=9999;
    window.__MESH_E2E_STORE.store_name='MUTATED AFTER CLOSE';
    window.__MESH_E2E_STORE.logo_url='https://example.test/changed.png';
    window.__E2E_ARCHIVE_HTML='';window.__E2E_ARCHIVE_CLOSED=false;
    window.open=()=>({document:{write:s=>{window.__E2E_ARCHIVE_HTML+=String(s)},close:()=>{window.__E2E_ARCHIVE_CLOSED=true}},print:()=>{}});
  });
  await vendor.locator('#vendorTabBtn-finance').click();
  await expect(vendor.locator('#vendorArchiveResultsV163')).toContainText('KINTO-STL-TEST');
  await vendor.locator('#vendorArchiveResultsV163 button').click();
  const printed=await frameWindow(page,()=>({html:window.__E2E_ARCHIVE_HTML,closed:window.__E2E_ARCHIVE_CLOSED}));
  expect(printed.closed).toBe(true);
  expect(printed.html).toContain('KINTO — كشف تسوية التاجر');
  expect(printed.html).toContain('KN-000100');
  expect(printed.html).toContain('123,000 IQD');
  expect(printed.html).toContain('12,300 IQD');
  expect(printed.html).toContain('110,700 IQD');
  expect(printed.html).toContain('Test Store');
  expect(printed.html).toContain('store-logo.png');
  expect(printed.html).toContain('platform-logo.png');
  expect(printed.html).not.toContain('MUTATED AFTER CLOSE');
  expect(printed.html).not.toContain('9,999 IQD');
  expect(printed.html).not.toContain('changed.png');
});
