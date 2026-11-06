// Presentation-only contract: checks the storefront card image tag without web traffic.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('js/local-store-card-v3.js','utf8');
const productCard=source.match(/function renderCards\(grid,store,products,\{fromCache=false\}=\{\}\)\{([\s\S]*?)\n\}/);
test('product grid renders first four images promptly and below-fold images lazily',()=>{
  assert.ok(productCard,'product card render function missing');
  assert.ok(productCard[1].includes('const cards=(products||[]).map((p,index)=>{'),'must use card index');
  assert.ok(productCard[1].includes('loading="\${index<4?\'eager\':\'lazy\'}"'),'first four visible images eager, remainder lazy');
  assert.ok(productCard[1].includes('decoding="async"'),'image decoding should not block UI');
});
test('image URL, stock and buttons retain original behavior',()=>{
  const body=productCard[1];
  for(const term of ['\${esc(p.image_url||placeholder)}','onerror="this.onerror=null;this.src=',"hasVisibleProductOptions(p)",'data-pid="\${esc(p.id)}"']){
    assert.ok(body.includes(term),'original product card contract missing: '+term);
  }
});
test('product lazy loading does not change cart or checkout source',()=>{
  assert.doesNotMatch(source,/window\.KintoLocalCartV93\s*=/);
  assert.match(source,/addToCart/);
});
