import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('V94 modal tabs, close and invoice remain responsive for multi-store orders',async({page})=>{
  await page.setContent('<button id="close">إغلاق</button><div id="details"></div>');
  await page.addScriptTag({path:path.join(root,'js/kinto-bundle-ui-v93.js')});
  await page.evaluate(()=>{
    const order={order_code:'KN-42',total_price:30,currency:'USD',details:{items:[
      {store_id:'s1',store_name:'المتجر الأول',product_name:'A',quantity:1,unit_price_local:10,line_total_local:10,currency:'USD'},
      {store_id:'s2',store_name:'المتجر الثاني',product_name:'B',quantity:1,unit_price_local:20,line_total_local:20,currency:'USD'}
    ],stores:[{store_id:'s1',store_name:'المتجر الأول',subtotal_local:10},{store_id:'s2',store_name:'المتجر الثاني',subtotal_local:20}]}};
    window.__modalClosed=false;
    document.querySelector('#close').addEventListener('click',()=>{window.__modalClosed=true});
    window.__popupWrites=[];
    window.__popup={document:{open(){},write(value){window.__popupWrites.push(String(value))},close(){}}};
    window.open=()=>{window.__popupOpenedAt=performance.now();return window.__popup};
    window.fetch=()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true,json:async()=>[]}),80));
    window.KintoBundleV94.enhance(document.querySelector('#details'),order);
  });

  const details=page.locator('#details');
  await expect(details.locator('.kinto-v93-bundle.kinto-v94-bundle')).toHaveCount(1);
  await details.locator('[data-v94-index="1"]').click();
  await expect(details.locator('[data-v94-panel="1"]')).toHaveClass(/active/);
  await expect(details.locator('[data-v94-panel="0"]')).not.toHaveClass(/active/);

  await page.locator('#close').click();
  await expect.poll(()=>page.evaluate(()=>window.__modalClosed)).toBe(true);

  await details.locator('.kinto-v94-invoice-btn').click();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__popupOpenedAt))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__popupWrites.join('').includes('الإجمالي الكلي'))).toBe(true);
  await expect(details.locator('.kinto-v94-invoice-btn')).toBeEnabled();
});
