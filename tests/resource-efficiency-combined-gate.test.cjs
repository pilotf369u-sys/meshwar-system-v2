// Combined gate: intended image compression AND two-photo save are present together.
// No Supabase requests; no simulated sale or user data changes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const helper=fs.readFileSync('js/kinto-vendor-product-image-prepare-v1.js','utf8');
const vendor=fs.readFileSync('vendor-dashboard-v2.html','utf8');
const save=fs.readFileSync('js/vendor-product-save-complete-v34.js','utf8');
const modal=fs.readFileSync('js/storefront-product-modal-v145.js','utf8');
test('combined image policy is actually 800px WebP Q50 targeting 70KB',()=>{
 assert.match(helper,/MAX_EDGE = 800/);
 assert.match(helper,/TARGET_BYTES = 70 \* 1024/);
 assert.match(helper,/QUALITY = 0\.50/);
 assert.match(helper,/toBlob\(resolve, 'image\/webp', QUALITY\)/);
});
test('two selected images pass the preparation and storage uploader without gallery truncation',()=>{
 assert.match(vendor,/<input id="productImageFile"[^>]*multiple/);
 assert.match(vendor,/KintoVendorProductImagePrepareV1\?\.prepare\(file\)/);
 assert.match(save,/for\(const file of files\)uploaded\.push/);
 assert.match(save,/uniq\(\[imageUrl,\.\.\.uploaded\]\)\.slice\(0,2\)/);
 assert.match(modal,/galleryImages=uniq\(\[product\?\.image_url/);
});
test('secondary photograph is activated on demand, not eager thumbnail load',()=>{
 assert.match(modal,/i===0\?'<img src="/);
 assert.match(modal,/:'<span aria-hidden="true">صورة/);
 assert.match(modal,/if\(thumb\)setGalleryImage\(thumb\.dataset\.gallerySrc\)/);
});
