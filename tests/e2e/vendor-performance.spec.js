const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('vendor barcode decorations settle while new product rows remain searchable',async({page})=>{
 await page.goto('/__vendor_performance_fixture__');
 await page.setContent('<section id="vendorTab-products"><input id="productName"><div class="vendor-table-wrap"><table><thead><tr><th>name</th></tr></thead><tbody id="productsBody"><tr><td>منتج</td><td><button onclick="editProduct(\'p\')">edit</button></td></tr></tbody></table></div></section><div id="unrelated"></div>');
 await page.evaluate(()=>{
  sessionStorage.setItem('meshwar_vendor_store',JSON.stringify({id:'s'}));
  window.barcodeCalls=[];window.barcodeRows=[{id:'p',product_name:'المنتج الأول',barcode:'1234',stock_quantity:5}];
  window.fetch=async(url,init)=>{window.barcodeCalls.push({url:String(url),method:init?.method||'GET'});return {ok:true,text:async()=>JSON.stringify(window.barcodeRows)}};
  window.loadProducts=async()=>{document.getElementById('productsBody').innerHTML='<tr><td>جديد</td><td><button onclick="editProduct(\'p\')">edit</button></td></tr>'};
  window.editProduct=()=>{};
 });
 await page.addScriptTag({path:path.resolve('js/vendor-barcode-smart-search-v11.js')});
 await page.evaluate(()=>window.MeshwarVendorBarcodeV11.install(window));
 await expect(page.locator('[data-mw-barcode-cell]')).toHaveText('1234');
 const before=await page.evaluate(()=>window.barcodeCalls.length);
 await page.evaluate(()=>{for(let i=0;i<25;i++)document.getElementById('unrelated').appendChild(document.createElement('span'))});
 await page.waitForTimeout(3100);
 expect(await page.evaluate(()=>window.barcodeCalls.length)).toBe(before);
 await page.evaluate(async()=>{window.barcodeRows[0].barcode='5678';await window.loadProducts()});
 await expect(page.locator('[data-mw-barcode-cell]')).toHaveText('5678');
 await page.locator('#vendorSmartProductSearch').fill('5678');
 await expect(page.locator('#productsBody tr')).toBeVisible();
 await page.locator('#vendorSmartProductSearch').fill('no-match');
 await expect(page.locator('#productsBody tr')).toBeHidden();
});

test('vendor margin uses canonical barcode without missing sku requests',async({page})=>{
 await page.goto('/__vendor_performance_fixture__');
 await page.setContent('<table><tbody id="productsBody"><tr><td>منتج</td><td><button onclick="editProduct(\'p\')">edit</button></td></tr></tbody></table><input id="productBarcode"><input id="mwProductCostPrice" value="50"><input id="productBasePrice"><input id="mwGlobalProfitMargin" value="25">');
 await page.evaluate(()=>{
  sessionStorage.setItem('meshwar_vendor_store',JSON.stringify({id:'s'}));window.barcodeCalls=[];
  window.fetch=async(url,init)=>{window.barcodeCalls.push({url:String(url),method:init?.method||'GET'});return {ok:true,text:async()=>JSON.stringify([{id:'p',product_name:'منتج',barcode:'1234',stock_quantity:5}])}};
 });
 await page.addScriptTag({path:path.resolve('js/vendor-barcode-margin-autopricing-v22.js')});
 await page.evaluate(async()=>{window.MeshwarVendorBarcodeMarginV22.install(window);await window.MeshwarVendorBarcodeMarginV22.hydrateBarcode(window,'p');window.MeshwarVendorBarcodeMarginV22.autoPrice(window)});
 await expect(page.locator('#productBarcode')).toHaveValue('1234');
 await expect(page.locator('#productBasePrice')).toHaveValue('63');
 await expect(page.locator('[data-mw-barcode-label]')).toContainText('1234');
 const calls=await page.evaluate(()=>window.barcodeCalls);
 expect(calls.every(c=>!c.url.includes('sku'))).toBe(true);
 expect(calls.every(c=>c.method==='GET')).toBe(true);
});
