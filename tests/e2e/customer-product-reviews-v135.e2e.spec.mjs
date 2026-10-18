import { test, expect } from '@playwright/test';
import { installMocks } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await installMocks(page);
  await page.goto('/login.html');
  await page.evaluate(() => {
    window.ensureCustomerPortalSupabase = async () => window.__meshwarSupabaseClient;
    document.body.innerHTML = `
      <nav class="tabs-nav">
        <button class="tab-btn" data-tab="orders">طلباتي</button>
        <button class="tab-btn" data-tab="notifications">الإشعارات</button>
        <button class="tab-btn" data-tab="drafts">المسودات</button>
      </nav>
      <section id="notifications" class="tab-panel"><div class="panel-head"></div><div id="notificationsContainer"></div></section>
      <section id="drafts" class="tab-panel"></section>
    `;
    sessionStorage.setItem('kinto_customer_review_session_v132', JSON.stringify({
      token: 'e2e-review-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }));
  });
  await page.evaluate(async () => {
    if (!window.__meshwarSupabaseClient) {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      window.__meshwarSupabaseClient = mod.createClient('https://hsmmbloouskqdnptiiad.supabase.co', 'e2e-anon');
    }
  });
  await page.addScriptTag({ url: '/js/customer-product-reviews-v135.js' });
  await page.waitForFunction(() =>
    window.KintoCustomerReviewsV135?.version === 'v135' &&
    document.querySelector('.review-tab-btn') &&
    document.getElementById('productReviews')
  );
});

test('production reviews script injects UI and calls the secure ready-products RPC', async ({ page }) => {
  await expect(page.locator('.review-tab-btn')).toBeVisible();
  await expect(page.locator('#productReviews')).toBeAttached();
  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('accept', 'image/*');
  await expect(page.locator('#reviewCameraInput')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#reviewFilesInput')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  await expect(page.locator('#reviewFilesInput')).not.toHaveAttribute('multiple', '');

  const diagnostics = await page.evaluate(() => window.KintoCustomerReviewsV135.diagnostics());
  expect(diagnostics?.ok).toBeTruthy();

  const rpcCalls = await page.evaluate(() => window.__MESH_E2E_RPC_CALLS || []);
  expect(rpcCalls.some(call =>
    call.name === 'customer_review_ready_products_v132' &&
    call.args?.p_session_token === 'e2e-review-token'
  )).toBeTruthy();

  await page.locator('.review-tab-btn').click();
  await expect(page.locator('#productReviews')).toHaveClass(/active/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.reviews-panel-card')).toBeVisible();
});

test('production reviews script blocks review submission in staff customer read-only mode', async ({ page }) => {
  await page.evaluate(() => { window.KINTO_STAFF_CUSTOMER_READ_ONLY = true; });

  const before = await page.evaluate(() => (window.__MESH_E2E_RPC_CALLS || []).filter(
    call => call.name === 'customer_submit_product_review_v132'
  ).length);

  await page.evaluate(() => {
    const form = document.getElementById('productReviewForm');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  const after = await page.evaluate(() => (window.__MESH_E2E_RPC_CALLS || []).filter(
    call => call.name === 'customer_submit_product_review_v132'
  ).length);

  expect(after).toBe(before);
  await expect(page.locator('#reviewFormMessage')).toContainText('وضع مشاهدة فقط');
});

test('customer retains chosen image after upload refusal and can retry to finalize',async({page})=>{
 await page.evaluate(()=>{
  const sb=window.__meshwarSupabaseClient,original=sb.rpc.bind(sb);
  window.__reviewUpload={attempts:0,tickets:0,finalized:0,types:[]};
  sb.rpc=async(name,args)=>{
   if(name==='customer_submit_product_review_v132')return {data:{id:'review-retry',status:'pending'}};
   if(name==='customer_create_review_image_upload_v150'){__reviewUpload.tickets++;return {data:{ticket_id:'same-ticket',storage_path:'reviews/review-retry/image.webp',bucket:'product-review-images'}}}
   if(name==='customer_finalize_review_image_upload_v150'){__reviewUpload.finalized++;return {data:{ok:true}}}
   return original(name,args);
  };
  sb.storage={from:bucket=>({async upload(path,file,options){__reviewUpload.attempts++;__reviewUpload.types.push({bucket,path,type:file.type,size:file.size,upsert:options.upsert});return __reviewUpload.attempts===1?{error:{message:'new row violates row-level security policy'}}:{error:null}},async remove(){return {error:null}}})};
 });
 await page.locator('.review-tab-btn').click();await page.locator('[data-review-index="0"]').click();
 await page.locator('[data-rating="5"]').click();await page.locator('#reviewComment').fill('صورة المنتج مع تقييم موثق');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='#063b2d';x.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1]});
 await page.locator('#reviewFilesInput').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('#reviewPreviews img')).toHaveCount(1);
 await page.locator('#reviewSubmitBtn').click();await expect(page.locator('#reviewFormMessage')).toContainText('اضغط إرسال مجدداً');
 expect(await page.evaluate(()=>__reviewUpload.finalized)).toBe(0);
 await expect(page.locator('#reviewPreviews img')).toHaveCount(1);
 await page.locator('#reviewSubmitBtn').click();await expect(page.locator('#reviewFormMessage')).toContainText('تم إرسال تقييمك وصورك للمراجعة بنجاح');
 const state=await page.evaluate(()=>__reviewUpload);expect(state.attempts).toBe(2);expect(state.finalized).toBe(1);expect(state.types[1]).toMatchObject({bucket:'product-review-images',upsert:false});expect(state.types[1].size).toBeLessThanOrEqual(51200);
 // Follow the saved image through the shipped admin and storefront renderers.
 await page.waitForTimeout(900);
 const imageUrl='https://hsmmbloouskqdnptiiad.supabase.co/storage/v1/object/public/product-review-images/reviews/review-retry/image.webp';
 await page.route('**/storage/v1/object/public/product-review-images/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')}));
 await page.setContent('<aside class="admin-master-sidebar"></aside><main class="main-content"></main>');
 await page.evaluate(imageUrl=>{
  window.__reviewPublished=false;window.checkAdminRole=async()=>true;window.getAdminId=()=>'test-admin';window.showSection=()=>{};
  window.ensureCustomerSupabase=async()=>({storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:imageUrl}})})},rpc:async(name)=>{
   if(name==='admin_get_review_image_v139')return {data:{storage_path:'reviews/review-retry/image.webp',bucket:'product-review-images'}};
   if(name==='admin_moderate_product_review_v138'){window.__reviewPublished=true;return {data:{}}}
   return {data:{total:1,items:[{id:'review-retry',rating:5,comment:'صورة المنتج',product_name:'Product',created_at:'2026-10-18',images:[{id:'saved-image'}]}]}};
  }});
 },imageUrl);
 await page.addScriptTag({url:'/js/admin-product-reviews-v138.js'});await page.evaluate(()=>KintoAdminProductReviewsV138.load());
 await expect(page.locator('[data-admin-review-preview]')).toHaveAttribute('src',imageUrl);await expect.poll(()=>page.locator('[data-admin-review-preview]').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 await page.locator('[data-decision="published"]').click();await expect.poll(()=>page.evaluate(()=>__reviewPublished)).toBe(true);
 await page.setContent('<div id="localStoreProductsGrid"><article class="local-v3-card" data-product-card="product"><button data-review-product="product">عرض التقييمات</button><div class="local-v3-name">Product</div></article></div>');
 await page.evaluate(()=>{const original=window.fetch.bind(window);window.fetch=async(url,options)=>{
  if(String(url).includes('/rpc/product_reviews_public_v141'))return new Response(JSON.stringify({count:1,average_rating:5,items:__reviewPublished?[{id:'review-retry',rating:5,customer_name:'عميل',comment:'صورة المنتج',images:[{storage_path:'reviews/review-retry/image.webp'}]}]:[]}),{status:200});
  if(String(url).includes('/rpc/product_review_summaries_v140'))return new Response('[]',{status:200});return original(url,options);
 }});
 await page.addScriptTag({url:'/js/store-product-reviews-v140.js'});await page.locator('[data-review-product="product"]').click();
 const image=page.locator('#kintoReviewsList .kinto-review-images img');await expect(image).toHaveAttribute('src',imageUrl);await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
});
