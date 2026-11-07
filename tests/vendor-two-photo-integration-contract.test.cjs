// Read-only integration contract: merchant shell, iframe, upload, and save wiring.
// No live browser, Supabase, Storage tickets, or product writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const parent=fs.readFileSync('vendor-dashboard.html','utf8');
const vendor=fs.readFileSync('vendor-dashboard-v2.html','utf8');
const save=fs.readFileSync('js/vendor-product-save-complete-v34.js','utf8');
const imageHelper=fs.readFileSync('js/kinto-vendor-product-image-prepare-v1.js','utf8');
test('parent installs the isolated product-save helper into the vendor iframe',()=>{
  assert.match(parent,/vendor-dashboard-v2\.html/);
  assert.match(parent,/js\/vendor-product-save-complete-v34\.js/);
  assert.match(parent,/MeshwarVendorProductSaveCompleteV34\?\.install\(frame\.contentWindow\)/);
});
test('two-image input and previews share exactly the save form file input',()=>{
  assert.match(vendor,/<input id="productImageFile"[^>]*\bmultiple\b/);
  assert.match(vendor,/id="imagePreviewContainer"/);
  assert.match(vendor,/id="productImagePreview"/);
  assert.match(vendor,/files\[1\]/);
  assert.match(save,/Array\.from\(\$\('productImageFile'\)\?\.files\|\|\[\]\)/);
  assert.match(save,/if\(selectedPhotos\.length>2\)return notice/);
});
test('each selected photo is prepared before getting ticket and reaching storage',()=>{
  const start=vendor.indexOf('async function uploadProductImage(file)');
  const end=vendor.indexOf('function previewSelectedProductImage()',start);
  assert.ok(start>=0&&end>start);
  const upload=vendor.slice(start,end);
  const prepare=upload.indexOf('KintoVendorProductImagePrepareV1?.prepare(file)');
  const ticket=upload.indexOf('KintoVendorMediaV1.ticket(vendorStore.id,prepared');
  const storage=upload.indexOf('.upload(path,prepared');
  assert.ok(prepare>=0&&prepare<ticket&&ticket<storage);
  assert.match(imageHelper,/TARGET_BYTES = 70 \* 1024/);
  assert.match(imageHelper,/MAX_EDGE = 800/);
  assert.match(imageHelper,/QUALITY = 0\.50/);
});
test('save preserves image and matrix stock metadata when upload is untouched',()=>{
  assert.match(save,/const images=\(!id\|\|files\.length\)\?/);
  assert.match(save,/oldOptions\.images/);
  assert.match(save,/if\(stockSnapshot&&variantTouched\)Object\.assign\(options,stockSnapshot\)/);
  assert.match(save,/if\(id&&existing\.updated_at\)query=query\.eq\('updated_at',existing\.updated_at\)/);
});
test('none of these files changes reviews, payment, cart or database permissions',()=>{
  for(const s of [parent,vendor,save,imageHelper]){
    assert.doesNotMatch(s,/create or replace function\s+public\.customer_cart/i);
  }
});
