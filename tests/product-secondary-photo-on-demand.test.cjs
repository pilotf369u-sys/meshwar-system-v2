// Contract-only: inspect customer gallery source, no browser or Supabase requests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('js/storefront-product-modal-v145.js','utf8');
test('second photo remains a selectable source but is not rendered as eager img thumbnail',()=>{
  assert.match(src,/galleryImages=uniq\(\[product\?\.image_url/);
  assert.match(src,/galleryImages\.map\(\(src,i\)=>/);
  assert.match(src,/i===0\?'<img src="/);
  assert.match(src,/:'<span aria-hidden="true">صورة/);
  assert.doesNotMatch(src,/\<img src="'\+esc\(src\)\+'" alt="'\+esc\(name\)\+' '\+\(i\+1\)/);
});
test('customer selecting secondary button still sets its src in main media',()=>{
  assert.match(src,/if\(thumb\)setGalleryImage\(thumb\.dataset\.gallerySrc\)/);
  assert.match(src,/function setGalleryImage\(src\).*?img\.src=src/);
  assert.match(src,/function stepGallery\(delta\).*?setGalleryImage\(galleryImages\[galleryIndex\]\)/);
});
test('source retains cart, rating, price and stock controls',()=>{
  for(const token of ["'kinto-detail-add'","'kinto-product-rating'","loadStockProduct","refreshQuantityLimit"]) {
    assert.ok(src.includes(token.replaceAll("'","")) || src.includes(token),'missing existing control '+token);
  }
});
