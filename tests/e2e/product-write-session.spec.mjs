import {test,expect} from '@playwright/test';
import {installMocks,openVendor,frameWindow} from './helpers.mjs';
test('actual complete product save uses the session transport and rejects a stock race without overwriting deduction',async({page})=>{
 await installMocks(page);page.on('dialog',dialog=>dialog.accept());
 const vendor=await openVendor(page,{authenticated:true});
 await expect.poll(()=>frameWindow(page,()=>Boolean(window.__mwVendorProductSaveCompleteV34))).toBe(true);
 await frameWindow(page,async()=>{window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1').cost_price=2;await window.MeshwarVendorRuntime.loadProducts();window.editProduct('p-1')});
 await expect(vendor.locator('#productModal')).toHaveClass(/flex/);
 await vendor.locator('#mwProductCostPrice').fill('2');await vendor.locator('#productStock').fill('21');
 await frameWindow(page,()=>{window.__MESH_E2E_BEFORE_PRODUCT_WRITE=args=>{
  if(args.p_id!=='p-1'||args.p_patch.stock_quantity===undefined)return;
  const product=window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1');product.stock_quantity=19;
  window.__MESH_E2E_BEFORE_PRODUCT_WRITE=null;
 }});
 await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
 await expect(vendor.locator('#globalNotice')).toContainText('تغير المنتج أثناء الحفظ');
 await expect(vendor.locator('#productModal')).toHaveClass(/flex/);
 expect(await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1').stock_quantity)).toBe(19);
 const calls=await frameWindow(page,()=>window.__MESH_E2E_PRODUCT_WRITES||[]);
 expect(calls.some(c=>c.p_session_token==='e2e-secure-token'&&c.p_filters.some(f=>f.field==='stock_quantity'))).toBeTruthy();
});
