import { test, expect } from '@playwright/test';
import { installMocks, openVendor, frameWindow } from './helpers.mjs';

async function shellOrderFilter(page,{highlightExact=false}={}){return page.evaluate(({highlightExact})=>window.MeshwarVendorOrderSmartSearchV13.filterRows(document.getElementById('vendorFrame').contentWindow,{highlightExact}),{highlightExact})}
async function shellStopCamera(page){return page.evaluate(()=>window.MeshwarVendorOrderSmartSearchV13.stopCamera(document.getElementById('vendorFrame').contentWindow))}
async function shellDecorateProducts(page){return page.evaluate(()=>window.MeshwarVendorBarcodeMarginV22.decorateBarcodes(document.getElementById('vendorFrame').contentWindow))}

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
    await shellOrderFilter(page,{highlightExact:true});await expect(vendor.locator('#ordersBody tr[data-mw-order-highlight="1"]')).toHaveCount(1);await expect(vendor.locator('#ordersBody tr[data-mw-order-highlight="1"]')).toContainText('MW-5664');
    await vendor.locator('#vendorOrderCameraBtn').click();await expect.poll(()=>frameWindow(page,()=>window.__E2E_CAMERA_START||null)).not.toBeNull();
    const camera=await frameWindow(page,()=>window.__E2E_CAMERA_START);expect(camera.camera).toEqual({facingMode:'environment'});expect(camera.config).toEqual({fps:10,qrbox:{width:250,height:150}});await shellStopCamera(page);
    await vendor.locator('#vendorOrderSearchClear').click();const row=vendor.locator('#ordersBody tr').filter({hasText:'MW-5664'});
    await row.getByRole('button',{name:'تفاصيل'}).click();await expect(vendor.locator('#vendorOrderDetailsModal')).toHaveClass(/flex/);await expect(vendor.locator('#vendorOrderDetailsBody')).toContainText('MW-5664');await frameWindow(page,()=>window.closeVendorOrderDetails());
    await frameWindow(page,()=>{window.__E2E_PRINT_HTML='';window.__E2E_PRINT_CLOSED=false;window.open=()=>({document:{write:s=>{window.__E2E_PRINT_HTML+=String(s)},close:()=>{window.__E2E_PRINT_CLOSED=true}}})});
    await row.getByRole('button',{name:/طباعة الملصق/}).click();const printed=await frameWindow(page,()=>({html:window.__E2E_PRINT_HTML,closed:window.__E2E_PRINT_CLOSED}));expect(printed.closed).toBe(true);expect(printed.html).toContain('MW-5664');expect(printed.html).toContain('MeshWar Cargo');expect(printed.html).toContain('JsBarcode');
    const tones=[['بانتظار الموافقة','pending'],['قيد التوصيل','transit'],['تم التسليم','success'],['مرتجع','danger'],['ملغي من قبل العميل','danger']];
    for(const[status,tone]of tones){await frameWindow(page,async s=>{const o=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-pending');o.status=s;await window.loadOrders()},status);await search.fill('MW-5664');await shellOrderFilter(page,{highlightExact:true});await expect.poll(()=>frameWindow(page,()=>document.querySelector('#ordersBody tr[data-mw-order-highlight] td[data-label="الحالة"] span')?.dataset.mwOrderStatusTone||'')).toBe(tone);await vendor.locator('#vendorOrderSearchClear').click()}
  });

  test('V95: secure store segments, full customer details and atomic status with legacy fallback',async({page})=>{
    const vendor=await openVendor(page);
    await frameWindow(page,async()=>{sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'e2e-secure-token',expiresAt:new Date(Date.now()+3600000).toISOString()}));await window.loadOrders()});
    const segmentRow=vendor.locator('#ordersBody tr').filter({hasText:'KN-009501'});
    await expect(segmentRow).toHaveCount(1);await expect(segmentRow).toContainText('Segment Product');
    await expect(segmentRow.locator('td[data-label="المحافظة / المدينة"]')).toContainText('بغداد / الكرادة');
    await expect(segmentRow.locator('td[data-label="الشحن"]')).toBeVisible();
    await expect(vendor.locator('#ordersBody tr').filter({hasText:'MW-5664'})).toHaveCount(1);
    const statusSelect=segmentRow.getByRole('combobox',{name:'حالة حصة المتجر'});await expect(statusSelect.locator('option')).toHaveCount(11);await expect(statusSelect.locator('option[value="قيد الطلب"]')).toHaveCount(0);await expect(statusSelect.locator('option[value="بانتظار تأكيد الدفع"]')).toHaveCount(0);await expect(statusSelect.locator('option[value="مخزن الشركة"]')).toHaveCount(1);await expect(statusSelect.locator('option[value="تم التسليم"]')).toHaveCount(1);
    await expect(segmentRow.locator('td[data-label="الحالة"] select')).toHaveCount(1);await expect(segmentRow.locator('td[data-label="الإجراء"] select')).toHaveCount(0);
    await segmentRow.getByRole('button',{name:'تفاصيل'}).click();
    const invoice=vendor.frameLocator('#vendorStoreInvoiceFrame');await expect(vendor.locator('#vendorOrderDetailsModal')).toHaveClass(/flex/);await expect(invoice.locator('.invoice-head')).toBeVisible();await expect(invoice.locator('body')).toContainText('عميل الاختبار');await expect(invoice.locator('body')).toContainText('CUS-9501');await expect(invoice.locator('body')).toContainText('07700000000');await expect(invoice.locator('body')).toContainText('الكرادة، شارع الاختبار');await expect(invoice.locator('body')).toContainText('SIP-9501');await expect(invoice.locator('body')).toContainText('Segment Product');await expect(invoice.locator('.grand')).toContainText('16,000 IQD');await expect(invoice.locator('.footer-contacts')).toContainText('00905378240430');await expect(invoice.locator('.footer-contacts')).toContainText('support@kinto.test');await frameWindow(page,()=>window.closeVendorOrderDetails());
    await statusSelect.selectOption('مخزن الشركة');
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_RPC_CALLS.filter(x=>x.name==='vendor_advance_order_segment_status').at(-1)?.args||null)).toEqual({p_session_token:'e2e-secure-token',p_segment_id:'seg-e2e-1',p_expected_status:'بانتظار التسديد',p_next_status:'مخزن الشركة'});
    await expect(vendor.locator('#ordersBody tr').filter({hasText:'KN-009501'})).toContainText('مخزن الشركة');
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_CANONICAL_STATUS||null)).toEqual({order_id:'global-e2e-1',status:'مخزن الشركة'});
    await frameWindow(page,()=>{const storeId=window.__MESH_E2E_STORE.id;window.__MESH_E2E_DB.order_store_segments.unshift({segment_id:'seg-e2e-live',order_id:'global-e2e-live',order_code:'KN-009599',reference_order_no:'SIP-9599',order_created_at:new Date().toISOString(),items_preview:[{store_id:storeId,product_id:'p-2',product_name:'Realtime Segment Product',quantity:1,unit_price_local:9000,line_total_local:9000,currency:'IQD'}],quantity_total:1,subtotal_local:9000,currency:'IQD',store_status:'بانتظار التسديد',confirmed_at:new Date().toISOString(),vendor_payment_status:'pending',customer:{name:'Realtime Customer'}});window.__MESH_E2E_ORDERS_REALTIME?.({new:{details:{source:'local_cart_bundle',items:[{store_id:storeId}]}}})});
    await expect(vendor.locator('#ordersBody tr').filter({hasText:'KN-009599'})).toHaveCount(1);await expect(vendor.locator('#ordersBody')).toContainText('Realtime Segment Product');
  });

  test('V95: legacy browser sessions must re-authenticate before global orders expose customer data',async({page})=>{
    const vendor=await openVendor(page);
    await frameWindow(page,async()=>{const storeId=window.__MESH_E2E_STORE.id;window.__MESH_E2E_DB.orders.unshift({id:'global-without-session',order_code:'KN-009599',total_price:16000,currency:'IQD',status:'تم التسديد',created_at:new Date().toISOString(),details:{source:'local_cart_bundle',bundle_stock_lifecycle_state:'deducted',items:[{store_id:storeId,store_name:'Test Store',product_id:'p-1',product_name:'Protected Product',quantity:1,unit_price_local:16000,line_total_local:16000,currency:'IQD'}],stores:[{store_id:storeId,store_name:'Test Store'}],store_statuses:{[storeId]:'بانتظار التسديد'}}});await window.loadOrders()});
    await expect(vendor.locator('#loginView')).toBeVisible();await expect(vendor.locator('#dashboardView')).toBeHidden();await expect(vendor.locator('#loginNotice')).toContainText('تسجيل الدخول مرة واحدة');
    await expect.poll(()=>frameWindow(page,()=>sessionStorage.getItem('meshwar_vendor_store'))).toBeNull();
    await vendor.locator('#loginIdentity').fill('vendor-e2e');await vendor.locator('#loginPassword').fill('correct-password');await vendor.locator('#loginBtn').click();
    await expect(vendor.locator('#dashboardView')).toBeVisible();await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_RPC_CALLS.filter(x=>x.name==='vendor_login_session').at(-1)?.args||null)).toEqual({p_identity:'vendor-e2e',p_password:'correct-password'});await expect.poll(()=>frameWindow(page,()=>JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||'')).toBe('e2e-secure-token');
  });

  test('catalog: add/edit stock, taxonomy persistence, barcode fallback, global margin auto-pricing and pagination',async({page})=>{
    const vendor=await openVendor(page);await vendor.locator('#vendorTabBtn-products').click();
    await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('1–10 من 23');await expect(vendor.locator('#productsBody tr:not(.mw-page-hidden)')).toHaveCount(10);
    await vendor.locator('#mwVendorPager-products [data-page-action="next"]').click();await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('11–20 من 23');
    await expect(vendor.locator('#mwProductMainCategory')).toBeAttached();await expect(vendor.locator('#mwProductSubCategory')).toBeAttached();await expect(vendor.locator('#mwProductCostPrice')).toBeAttached();await expect(vendor.locator('#mwGlobalProfitMargin')).toBeAttached();
    await expect(vendor.locator('#exchangeRate')).toHaveValue('1');
    await vendor.locator('#mwGlobalProfitMargin').fill('25');await vendor.locator('#mwSaveProfitMargin').click();await expect(vendor.locator('#exchangeRate')).toHaveValue('1');
    await expect.poll(()=>frameWindow(page,()=>Boolean(window.MeshwarTaxonomyPersistenceV10))).toBe(true);await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwTaxonomyV10))).toBe(true);await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwFinanceV21))).toBe(true);

    await frameWindow(page,()=>{const p=window.__MESH_E2E_DB.local_products.find(x=>x.id==='p-1');p.barcode=null;p.sku='LEGACY-SKU-01'});await shellDecorateProducts(page);
    await expect(vendor.locator('#productsBody tr').filter({hasText:'Test Product 01'}).locator('[data-mw-barcode-label]')).toContainText('LEGACY-SKU-01');
    const productSearch=vendor.locator('#vendorSmartProductSearch');await productSearch.fill('LEGACY-SKU-01');await productSearch.press('Enter');await expect(vendor.locator('#productModal')).toHaveClass(/flex/);await expect(vendor.locator('#productBarcode')).toHaveValue('LEGACY-SKU-01');await frameWindow(page,()=>window.closeProductModal());

    await vendor.getByRole('button',{name:/منتج جديد/}).click();await expect(vendor.locator('#productModal')).toHaveClass(/flex/);
    await vendor.locator('#productName').fill('E2E Added Product');await vendor.locator('#mwProductCostPrice').fill('18.5');await expect(vendor.locator('#productBasePrice')).toHaveValue('24');await vendor.locator('#productBasePrice').fill('44');await vendor.locator('#productStock').fill('17');
    await vendor.locator('#mwProductMainCategory').selectOption('cat-a');await expect(vendor.locator('#mwProductSubCategory option[value="sub-a"]')).toHaveCount(1);await vendor.locator('#mwProductSubCategory').selectOption('sub-a');await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product')||null)).not.toBeNull();await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product')?.subcategory_id||'')).toBe('sub-a');await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product')?.cost_price)).toBe(18.5);
    const added=await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product'));expect(added.stock_quantity).toBe(17);expect(added.base_price).toBe(44);expect(added.category_id).toBe('sub-a');expect(added.subcategory_id).toBe('sub-a');
    await frameWindow(page,()=>window.editProduct('p-1'));await expect(vendor.locator('#productModal')).toHaveClass(/flex/);await expect(vendor.locator('#productBarcode')).toHaveValue('LEGACY-SKU-01');await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwTaxonomyV10))).toBe(true);await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwFinanceV21))).toBe(true);
    await vendor.locator('#productStock').fill('73');await vendor.locator('#mwProductCostPrice').fill('22');await expect(vendor.locator('#productBasePrice')).toHaveValue('28');await vendor.locator('#productBasePrice').fill('31');await vendor.locator('#mwProductMainCategory').selectOption('cat-b');await expect(vendor.locator('#mwProductSubCategory option[value="sub-b"]')).toHaveCount(1);await vendor.locator('#mwProductSubCategory').selectOption('sub-b');await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1')?.stock_quantity)).toBe(73);await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1')?.subcategory_id||'')).toBe('sub-b');await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1')?.cost_price)).toBe(22);
    const moved=await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1'));expect(moved.base_price).toBe(31);expect(moved.barcode).toBe('LEGACY-SKU-01');expect(moved.category_id).toBe('sub-b');expect(moved.subcategory_id).toBe('sub-b');await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('من 24');
  });

  test('finance: legacy KPIs reconcile and V21 P&L, expenses and editable invoice work',async({page})=>{
    const vendor=await openVendor(page);await vendor.locator('#vendorTabBtn-finance').click();
    await expect(vendor.locator('#statSales')).toHaveText('300 USD');await expect(vendor.locator('#statCommission')).toHaveText('40 USD');await expect(vendor.locator('#statOther')).toHaveText('15 USD');await expect(vendor.locator('#statPending')).toHaveText('160 USD');await expect(vendor.locator('#statPaid')).toHaveText('85 USD');await expect(vendor.locator('#statNet')).toHaveText('245 USD');
    await expect(vendor.locator('#vendorFinanceBody tr')).toHaveCount(2);
    const rows=await vendor.locator('#vendorFinanceBody tr').evaluateAll(list=>list.map(row=>{const num=label=>Number((row.querySelector(`td[data-label="${label}"]`)?.textContent||'0').replace(/[^0-9.-]/g,''))||0;const commission=Number((row.querySelector('td[data-label="العمولة (%)"] .vendor-muted')?.textContent||'0').replace(/[^0-9.-]/g,''))||0;return{total:num('المبلغ الكلي'),commission,other:num('أخرى'),net:num('المبلغ الصافي'),paid:/مدفوع/.test(row.querySelector('td[data-label="حالة الدفع"]')?.textContent||'')}}));
    const reconciled=rows.reduce((a,r)=>{a.sales+=r.total;a.commission+=r.commission;a.other+=r.other;a.net+=r.net;if(r.paid)a.paid+=r.net;else a.pending+=r.net;return a},{sales:0,commission:0,other:0,pending:0,paid:0,net:0});expect(reconciled).toEqual({sales:300,commission:40,other:15,pending:160,paid:85,net:245});await expect(vendor.locator('[data-mw-kpi-icon]')).toHaveCount(6);

    await frameWindow(page,()=>{const paid=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-paid'),unpaid=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-unpaid');paid.snapshot_cost_price=20;unpaid.snapshot_cost_price=25;window.__MESH_E2E_DB.vendor_operating_expenses=[{id:1,store_id:'store-e2e-1',amount:25,currency:'USD',category:'إيجار',note:'E2E',expense_date:'2026-08-22'}]});
    await expect(vendor.locator('#vendorTabBtn-pl')).toBeAttached();await vendor.locator('#vendorTabBtn-pl').click();await expect(vendor.locator('#vendorTab-pl')).toHaveClass(/active/);await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);
    await expect.poll(()=>frameWindow(page,()=>window.__mwFinanceV21Last||null)).not.toBeNull();
    expect(await frameWindow(page,()=>window.__mwFinanceV21Last)).toEqual({sales:300,cogs:90,fees:55,expenses:25,net:130,deliveredCount:2,missing:0,estimated:0});
    await expect(vendor.locator('#mwPlSales')).toHaveText('300 USD');await expect(vendor.locator('#mwPlCogs')).toHaveText('90 USD');await expect(vendor.locator('#mwPlNet')).toHaveText('130 USD');
    await vendor.locator('#mwExpenseAmount').fill('10');await vendor.locator('#mwExpenseCategory').fill('تسويق');await vendor.locator('#mwExpenseNote').fill('E2E marketing');await vendor.locator('#mwExpenseAdd').click();await expect(vendor.locator('#mwPlExpenses')).toHaveText('35 USD');await expect(vendor.locator('#mwPlNet')).toHaveText('120 USD');
    await frameWindow(page,()=>{window.__E2E_INVOICE_HTML='';window.__E2E_INVOICE_CLOSED=false;window.open=()=>({document:{write:s=>{window.__E2E_INVOICE_HTML+=String(s)},close:()=>{window.__E2E_INVOICE_CLOSED=true}}})});
    await vendor.locator('[data-mw-invoice]').first().click();const invoice=await frameWindow(page,()=>({html:window.__E2E_INVOICE_HTML,closed:window.__E2E_INVOICE_CLOSED}));expect(invoice.closed).toBe(true);expect(invoice.html).toContain('contenteditable="true"');expect(invoice.html).toContain('طباعة / حفظ PDF');expect(invoice.html).toContain('MW-566');
  });

  test('UI: real categories pagination, single active tab and theme consistency',async({page})=>{
    const vendor=await openVendor(page);await vendor.locator('#vendorTabBtn-categories').click();await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);await expect(vendor.locator('#vendorTab-categories')).toHaveClass(/active/);await expect(vendor.locator('#mwCatList .mw-cat-group')).toHaveCount(21);await expect(vendor.locator('#mwVendorPager-categories [data-pager-info]')).toContainText('1–10 من 21');await expect(vendor.locator('#mwCatList .mw-cat-group:not(.mw-page-hidden)')).toHaveCount(10);await vendor.locator('#mwVendorPager-categories [data-page-action="next"]').click();await expect(vendor.locator('#mwVendorPager-categories [data-pager-info]')).toContainText('11–20 من 21');
    await vendor.locator('#vendorTabBtn-orders').click();await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);await expect(vendor.locator('#vendorTab-orders')).toHaveClass(/active/);await expect(vendor.locator('#vendorTab-categories')).not.toHaveClass(/active/);
    await vendor.locator('button[onclick="toggleTheme()"]').click();await expect(vendor.locator('html')).toHaveClass(/light/);await vendor.locator('#vendorTabBtn-products').click();await expect(vendor.locator('html')).toHaveClass(/light/);await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);const lightBg=await frameWindow(page,()=>getComputedStyle(document.body).backgroundColor);expect(lightBg).not.toBe('rgba(0, 0, 0, 0)');await vendor.locator('button[onclick="toggleTheme()"]').click();await expect(vendor.locator('html')).toHaveClass(/dark/);
  });
});
