import { test, expect } from '@playwright/test';
import { installMocks, openVendor, frameWindow } from './helpers.mjs';

test.describe('MeshWar vendor E2E integration gate',()=>{
  test.beforeEach(async({page})=>{await installMocks(page)});

  test('orders: lifecycle rendering, filters, barcode search, camera, details and label print',async({page})=>{
    const vendor=await openVendor(page);
    await expect(vendor.locator('#ordersBody tr')).toHaveCount(15);

    await vendor.locator('[data-order-filter="delivery"]').click();
    await expect(vendor.locator('#ordersBody tr td[data-label="الحالة"]')).toContainText(['قيد التوصيل']);
    await vendor.locator('[data-order-filter="returns"]').click();
    await expect(vendor.locator('#ordersBody')).toContainText('مرتجع');
    await expect(vendor.locator('#ordersBody')).toContainText('ملغي من قبل العميل');
    await vendor.locator('[data-order-filter="all"]').click();

    const search=vendor.locator('#vendorOrderSmartSearch');
    await search.fill('mw-٥٦٦٤؟');
    await expect(search).toHaveValue('MW-5664');
    await search.press('Enter');
    await expect(vendor.locator('#ordersBody tr[data-mw-order-highlight="1"]')).toHaveCount(1);
    await expect(vendor.locator('#ordersBody tr[data-mw-order-highlight="1"]')).toContainText('MW-5664');

    await vendor.locator('#vendorOrderCameraBtn').click();
    await expect.poll(()=>frameWindow(page,()=>window.__E2E_CAMERA_START||null)).not.toBeNull();
    const camera=await frameWindow(page,()=>window.__E2E_CAMERA_START);
    expect(camera.camera).toEqual({facingMode:'environment'});
    expect(camera.config).toEqual({fps:10,qrbox:{width:250,height:150}});
    await frameWindow(page,()=>window.MeshwarVendorOrderSmartSearchV13.stopCamera(window));

    await vendor.locator('#vendorOrderSearchClear').click();
    const row=vendor.locator('#ordersBody tr').filter({hasText:'MW-5664'});
    await row.getByRole('button',{name:'تفاصيل'}).click();
    await expect(vendor.locator('#vendorOrderDetailsModal')).toHaveClass(/flex/);
    await expect(vendor.locator('#vendorOrderDetailsBody')).toContainText('MW-5664');
    await frameWindow(page,()=>window.closeVendorOrderDetails());

    const popupPromise=page.waitForEvent('popup');
    await row.getByRole('button',{name:/طباعة الملصق/}).click();
    const popup=await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('body')).toContainText('MW-5664');
    await expect(popup.locator('body')).toContainText('MeshWar Cargo');
    await popup.close();

    const tones=[
      ['بانتظار الموافقة','pending'],['قيد التوصيل','transit'],['تم التسليم','success'],['مرتجع','danger'],['ملغي من قبل العميل','danger']
    ];
    for(const [status,tone] of tones){
      await frameWindow(page,async s=>{const o=window.__MESH_E2E_DB.orders.find(x=>x.id==='o-pending');o.status=s;await window.loadOrders()},status);
      await search.fill('MW-5664');await search.press('Enter');
      await expect.poll(()=>frameWindow(page,()=>document.querySelector('#ordersBody tr[data-mw-order-highlight] td[data-label="الحالة"] span')?.dataset.mwOrderStatusTone||'' )).toBe(tone);
      await vendor.locator('#vendorOrderSearchClear').click();
    }
  });

  test('catalog: add/edit stock, taxonomy persistence and pagination',async({page})=>{
    const vendor=await openVendor(page);
    await vendor.locator('#vendorTabBtn-products').click();
    await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('1–10 من 23');
    await expect(vendor.locator('#productsBody tr:not(.mw-page-hidden)')).toHaveCount(10);
    await vendor.locator('#mwVendorPager-products [data-page-action="next"]').click();
    await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('11–20 من 23');

    await frameWindow(page,()=>{
      const modal=document.getElementById('productModal');
      for(const [id,values] of [['mwProductMainCategory',['cat-a','cat-b']],['mwProductSubCategory',['sub-a','sub-b']]]){
        if(document.getElementById(id))continue;const s=document.createElement('select');s.id=id;
        for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v;s.appendChild(o)}modal.appendChild(s);
      }
      const script=document.createElement('script');script.src='/js/local-store-taxonomy-persistence-v10.js';document.head.appendChild(script);
    });
    await expect.poll(()=>frameWindow(page,()=>Boolean(window.saveProduct?.__mwTaxonomyV10))).toBe(true);

    await frameWindow(page,()=>window.openProductModal());
    await vendor.locator('#productName').fill('E2E Added Product');
    await vendor.locator('#productBasePrice').fill('44');
    await vendor.locator('#productStock').fill('17');
    await vendor.locator('#mwProductMainCategory').selectOption('cat-a');
    await vendor.locator('#mwProductSubCategory').selectOption('sub-a');
    await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product')||null)).not.toBeNull();
    const added=await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.product_name==='E2E Added Product'));
    expect(added.stock_quantity).toBe(17);expect(added.category_id).toBe('sub-a');expect(added.subcategory_id).toBe('sub-a');

    await frameWindow(page,()=>window.editProduct('p-1'));
    await vendor.locator('#productStock').fill('73');
    await vendor.locator('#mwProductMainCategory').selectOption('cat-b');
    await vendor.locator('#mwProductSubCategory').selectOption('sub-b');
    await vendor.getByRole('button',{name:'حفظ المنتج'}).click();
    await expect.poll(()=>frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1')?.stock_quantity)).toBe(73);
    const moved=await frameWindow(page,()=>window.__MESH_E2E_DB.local_products.find(p=>p.id==='p-1'));
    expect(moved.category_id).toBe('sub-b');expect(moved.subcategory_id).toBe('sub-b');
    await expect(vendor.locator('#mwVendorPager-products [data-pager-info]')).toContainText('من 24');
  });

  test('finance: six KPIs exactly reconcile with delivered-order rows',async({page})=>{
    const vendor=await openVendor(page);
    await vendor.locator('#vendorTabBtn-finance').click();
    await expect(vendor.locator('#statSales')).toHaveText('300 USD');
    await expect(vendor.locator('#statCommission')).toHaveText('40 USD');
    await expect(vendor.locator('#statOther')).toHaveText('15 USD');
    await expect(vendor.locator('#statPending')).toHaveText('160 USD');
    await expect(vendor.locator('#statPaid')).toHaveText('85 USD');
    await expect(vendor.locator('#statNet')).toHaveText('245 USD');
    await expect(vendor.locator('#vendorFinanceBody tr')).toHaveCount(2);
    const calculated=await frameWindow(page,()=>window.financialTotals());
    expect(calculated).toEqual({sales:300,commission:40,other:15,pending:160,paid:85,net:245});
    await expect(vendor.locator('[data-mw-kpi-icon]')).toHaveCount(6);
  });

  test('UI: single active tab, category pagination and theme remains consistent across navigation',async({page})=>{
    const vendor=await openVendor(page);
    await frameWindow(page,()=>{
      const nav=document.querySelector('.vendor-main-tabs');
      const btn=document.createElement('button');btn.id='vendorTabBtn-categories';btn.className='vendor-main-tab';btn.textContent='التصنيفات';nav.appendChild(btn);
      const panel=document.createElement('section');panel.id='vendorTab-categories';panel.className='vendor-tab-panel';
      const list=document.createElement('div');list.id='mwCatList';for(let i=1;i<=21;i++){const g=document.createElement('div');g.className='mw-cat-group';g.textContent='Category '+i;list.appendChild(g)}panel.appendChild(list);document.querySelector('main').appendChild(panel);
      window.MeshwarVendorThemePaginationV16.applyPagination(window,'categories',{reset:true});
      window.MeshwarVendorThemePaginationV16.enforceSingleTab(window,'categories');
    });
    await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);
    await expect(vendor.locator('#vendorTab-categories')).toHaveClass(/active/);
    await expect(vendor.locator('#mwVendorPager-categories [data-pager-info]')).toContainText('1–10 من 21');
    await expect(vendor.locator('#mwCatList .mw-cat-group:not(.mw-page-hidden)')).toHaveCount(10);

    await vendor.locator('#vendorTabBtn-orders').click();
    await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);
    await expect(vendor.locator('#vendorTab-orders')).toHaveClass(/active/);
    await expect(vendor.locator('#vendorTab-categories')).not.toHaveClass(/active/);

    await vendor.locator('button[onclick="toggleTheme()"]').click();
    await expect(vendor.locator('html')).toHaveClass(/light/);
    await vendor.locator('#vendorTabBtn-products').click();
    await expect(vendor.locator('html')).toHaveClass(/light/);
    await expect(vendor.locator('.vendor-tab-panel.active')).toHaveCount(1);
    const lightBg=await frameWindow(page,()=>getComputedStyle(document.body).backgroundColor);
    expect(lightBg).not.toBe('rgba(0, 0, 0, 0)');
    await vendor.locator('button[onclick="toggleTheme()"]').click();
    await expect(vendor.locator('html')).toHaveClass(/dark/);
  });
});
