import { test, expect } from '@playwright/test';
import { installMocks, openVendor, frameWindow } from './helpers.mjs';

async function shellOrderFilter(page,{highlightExact=false}={}){return page.evaluate(({highlightExact})=>window.MeshwarVendorOrderSmartSearchV13.filterRows(document.getElementById('vendorFrame').contentWindow,{highlightExact}),{highlightExact})}
async function shellStopCamera(page){return page.evaluate(()=>window.MeshwarVendorOrderSmartSearchV13.stopCamera(document.getElementById('vendorFrame').contentWindow))}

test.describe('MeshWar vendor E2E integration gate',()=>{
  test.beforeEach(async({page})=>{await installMocks(page)});

  test('orders: lifecycle rendering, filters, barcode search, camera, details and label print',async({page})=>{
    const vendor=await openVendor(page);
    await expect(vendor.locator('#ordersBody tr')).toHaveCount(15);
    await vendor.locator('[data-order-filter="delivery"]').click();await expect(vendor.locator('#ordersBody')).toContainText('قيد التوصيل');
    await vendor.locator('[data-order-filter="returns"]').click();await expect(vendor.locator('#ordersBody')).toContainText('مرتجع');await expect(vendor.locator('#ordersBody')).toContainText('ملغي من قبل العميل');
    await vendor.locator('[data-order-filter="all"]').click();

    const search=vendor.locator('#vendorOrderSmartSearch');
    await search.fill('mw-٥٦٦٤؟');await expect(search).toHaveValue('MW-5664');await search.press('Enter');
    const target=vendor.locator('#ordersBody tr').filter({hasText:'MW-5664'});await expect(target).toHaveCount(1);await expect(target).toBeVisible();
    await shellOrderFilter(page,{highlightExact:true});
    await expect(vendor.locator('#ordersBody tr[data-mw-order-highlight="1"]')).toHaveCount(1);await expect(vendor.locator('#ordersBody tr[data-mw-order-highlight="1"]')).toContainText('MW-5664');

    await vendor.locator('#vendorOrderCameraBtn').click();
    await expect.poll(()=>frameWindow(page,()=>window.__E2E_CAMERA_START||null)).not.toBeNull();
    const camera=await frameWindow(page,()=>window.__E2E_CAMERA_START);expect(camera.camera).toEqual({facingMode:'environment'});expect(camera.config).toEqual({fps:10,qrbox:{width:250,height:150}});await shellStopCamera(page);

    await vendor.locator('#vendorOrderSearchClear').click();const row=vendor.locator('#ordersBody tr').filter({hasText:'MW-5664'});
    await row.getByRole('button',{name:'تفاصيل'}).click();await expect(vendor.locator('#vendorOrderDetailsModal')).toHaveClass(/flex/);await expect(vendor.locator('#vendorOrderDetailsBody')).toContainText('MW-5664');await frameWindow(page,()=>window.closeVendorOrderDetails());

    await frameWindow(page,()=>{
      window.__E2E_PRINT_HTML='';window.__E2E_PRINT_CLOSED=false;
      window.open=()=>({document:{write:s=>{window.__E2E_PRINT_HTML+=String(s)},close:()=>{window.__E2E_PRINT_CLOSED=true}}});
    });
    await row.getByRole('button',{name:/طباعة الملصق/}).click();
    const printed=await frameWindow(page,()=>({html:window.__E2E_PRINT_HTML,closed:window.__E2E_PRINT_CLOSED}));
    expect(printed.closed).toBe(true);expect(printed.html).toContain('MW-5664');expect(printed.html).toContain('MeshWar Cargo');expect(printed.html).toContain('JsBarcode');

    const tones=[['بانتظار الموافقة','pending'],['قيد التوصيل','transit'],['تم التسليم','success'],['مرتجع','danger'],['ملغي من قبل العميل','danger']];
    for(const[status,tone]of tones){
      await frameWindow(page,async s=>{const o=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-pending');o.status=s;await window.loadOrders()},status);
      await search.fill('MW-5664');await shellOrderFilter(page,{highlightExact:true});
      await expect.poll(()=>frameWindow(page,()=>document.querySelector('#ordersBody tr[data-mw-order-highlight] td[data-label="الحالة"] span')?.dataset.mwOrderStatusTone||'')).toBe(tone);
      await vendor.locator('#vendorOrderSearchClear').click();
    }
  });

  test('catalog: add/edit stock, taxonomy persistence and pagination',async({page})=>{
    const vendor=await openVendor(page);await vendor.locator('#vendorTabBtn-products').click();
    await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('1–10 من 23');await expect(vendor.locator('#productsBody tr:not(.mw-page-hidden)')).toHaveCount(10);
    await vendor.locator('#mwVendorPager-products [data-page-action="next"]').click();await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('11–20 من 23');
    await expect(vendor.locator('#mwProductMainCategory')).toBeAttached();await expect(vendor.locator('#mwProductSubCategory')).toBeAttached();
    await expect.poll(()=>frameWindow(page,()=>Boolean(window.MeshwarTaxonomyPersistenceV10))).toBe(true);
    await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwTaxonomyV10))).toBe(true);

    await vendor.getByRole('button',{name:/منتج جديد/}).click();await expect(vendor.locator('#productModal')).toHaveClass(/flex/);
    await vendor.locator('#productName').fill('E2E Added Product');await vendor.locator('#productBasePrice').fill('44');await vendor.locator('#productStock').fill('17');
    await vendor.locator('#mwProductMainCategory').selectOption('cat-a');await expect(vendor.locator('#mwProductSubCategory option[value="sub-a"]')).toHaveCount(1);await vendor.locator('#mwProductSubCategory').selectOption('sub-a');
    await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product')||null)).not.toBeNull();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product')?.subcategory_id||'')).toBe('sub-a');
    const added=await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product'));expect(added.stock_quantity).toBe(17);expect(added.category_id).toBe('sub-a');expect(added.subcategory_id).toBe('sub-a');

    await frameWindow(page,()=>window.editProduct('p-1'));await expect(vendor.locator('#productModal')).toHaveClass(/flex/);await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwTaxonomyV10))).toBe(true);
    await vendor.locator('#productStock').fill('73');await vendor.locator('#mwProductMainCategory').selectOption('cat-b');await expect(vendor.locator('#mwProductSubCategory option[value="sub-b"]')).toHaveCount(1);await vendor.locator('#mwProductSubCategory').selectOption('sub-b');
    await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1')?.stock_quantity)).toBe(73);await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1')?.subcategory_id||'')).toBe('sub-b');
    const moved=await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1'));expect(moved.category_id).toBe('sub-b');expect(moved.subcategory_id).toBe('sub-b');
    await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('من 24');
  });

  test('finance: six KPIs exactly reconcile with delivered-order rows',async({page})=>{
    const vendor=await openVendor(page);await vendor.locator('#vendorTabBtn-finance').click();
    await expect(vendor.locator('#statSales')).toHaveText('300 USD');await expect(vendor.locator('#statCommission')).toHaveText('40 USD');await expect(vendor.locator('#statOther')).toHaveText('15 USD');await expect(vendor.locator('#statPending')).toHaveText('160 USD');await expect(vendor.locator('#statPaid')).toHaveText('85 USD');await expect(vendor.locator('#statNet')).toHaveText('245 USD');
    await expect(vendor.locator('#vendorFinanceBody tr')).toHaveCount(2);
    const rows=await vendor.locator('#vendorFinanceBody tr').evaluateAll(list=>list.map(row=>{const num=label=>Number((row.querySelector(`td[data-label="${label}"]`)?.textContent||'0').replace(/[^0-9.-]/g,''))||0;const commission=Number((row.querySelector('td[data-label="العمولة (%)"] .vendor-muted')?.textContent||'0').replace(/[^0-9.-]/g,''))||0;return{total:num('المبلغ الكلي'),commission,other:num('أخرى'),net:num('المبلغ الصافي'),paid:/مدفوع/.test(row.querySelector('td[data-label="حالة الدفع"]')?.textContent||'')}}));
    const reconciled=rows.reduce((a,r)=>{a.sales+=r.total;a.commission+=r.commission;a.other+=r.other;a.net+=r.net;if(r.paid)a.paid+=r.net;else a.pending+=r.net;return a},{sales:0,commission:0,other:0,pending:0,paid:0,net:0});expect(reconciled).toEqual({sales:300,commission:40,other:15,pending:160,paid:85,net:245});await expect(vendor.locator('[data-mw-kpi-icon]')).toHaveCount(6);
  });

  test('UI: real categories pagination, single active tab and theme consistency',async({page})=>{
    const vendor=await openVendor(page);await vendor.locator('#vendorTabBtn-categories').click();
    await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);await expect(vendor.locator('#vendorTab-categories')).toHaveClass(/active/);await expect(vendor.locator('#mwCatList .mw-cat-group')).toHaveCount(21);await expect(vendor.locator('#mwVendorPager-categories [data-pager-info]')).toContainText('1–10 من 21');await expect(vendor.locator('#mwCatList .mw-cat-group:not(.mw-page-hidden)')).toHaveCount(10);
    await vendor.locator('#mwVendorPager-categories [data-page-action="next"]').click();await expect(vendor.locator('#mwVendorPager-categories [data-pager-info]')).toContainText('11–20 من 21');
    await vendor.locator('#vendorTabBtn-orders').click();await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);await expect(vendor.locator('#vendorTab-orders')).toHaveClass(/active/);await expect(vendor.locator('#vendorTab-categories')).not.toHaveClass(/active/);
    await vendor.locator('button[onclick="toggleTheme()"]').click();await expect(vendor.locator('html')).toHaveClass(/light/);await vendor.locator('#vendorTabBtn-products').click();await expect(vendor.locator('html')).toHaveClass(/light/);await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);const lightBg=await frameWindow(page,()=>getComputedStyle(document.body).backgroundColor);expect(lightBg).not.toBe('rgba(0, 0, 0, 0)');await vendor.locator('button[onclick="toggleTheme()"]').click();await expect(vendor.locator('html')).toHaveClass(/dark/);
  });
});
