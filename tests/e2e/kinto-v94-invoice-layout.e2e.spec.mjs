import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('V94 invoice restores Sipariş header and supports long multi-page tables',async({page})=>{
  await page.setContent('<main></main>');
  await page.addScriptTag({path:path.join(root,'js/kinto-bundle-ui-v93.js')});
  await page.evaluate(()=>{
    const items=Array.from({length:45},(_,i)=>({
      store_id:'s1',store_name:'KINTO',product_name:`Product ${i+1}`,
      quantity:1,unit_price_local:1000,line_total_local:1000,currency:'IQD'
    }));
    const order={order_code:'KN-11',reference_order_no:'SP-EMP-92841',created_at:'2026-09-03T00:33:14Z',status:'انتظار رد الموظف',total_price:45000,currency:'IQD',details:{items,stores:[{store_id:'s1',store_name:'KINTO',subtotal_local:45000}]}};
    window.__invoiceWrites=[];
    window.open=()=>({document:{open(){},write(value){window.__invoiceWrites.push(String(value))},close(){}}});
    window.fetch=async()=>({ok:true,json:async()=>[]});
    window.KintoBundleV94.printInvoice(order);
  });
  await expect.poll(()=>page.evaluate(()=>window.__invoiceWrites.join('').includes('SP-EMP-92841'))).toBe(true);
  const html=await page.evaluate(()=>window.__invoiceWrites.join(''));
  expect(html).toContain('Sipariş No / Barcode');
  expect(html).toContain('id="invoiceBarcode"');
  expect(html).toContain('class="brand-word">KINTO');
  expect(html).not.toContain('الإجمالي العالمي المطلوب من العميل');
  expect(html).not.toContain('class="tabs"');
  expect(html).toContain('<tfoot><tr class="store-summary">');
  expect(html).toContain('class="grand"><span>الإجمالي الكلي');
  expect(html).toContain('thead{display:table-header-group}');
  expect(html).toContain('break-inside:auto');
  expect(html.match(/Product \d+/g)).toHaveLength(45);
});
