import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../store.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../js/store-product-reviews-v140.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/store-product-reviews-v140.css',import.meta.url),'utf8');

assert.match(html,/store-product-reviews-v140\.js/);
assert.match(html,/store-product-reviews-v140\.css/);
assert.match(client,/product_review_summaries_v140/);
assert.match(client,/product_reviews_public_v141/);
assert.match(client,/product_review_helpful_toggle_v141/);
assert.match(client,/moderation|published|تقييمات المنتج/);
assert.match(client,/data-review-product/);
assert.match(client,/data-review-lightbox/);
assert.match(css,/\.kinto-reviews-modal/);
assert.match(css,/\.kinto-review-lightbox/);
assert.match(css,/data-mw-global-theme="light"/);
assert.match(css,/data-mw-global-theme="dark"/);
assert.match(css,/minmax\(min\(190px,100%\),220px\)/);
assert.match(css,/repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css,/-webkit-line-clamp:2/);
for(const source of[client,css]){
  assert.doesNotMatch(source,/(?:update|insert|delete).*orders/i);
  assert.doesNotMatch(source,/(?:update|insert|delete).*employees/i);
  assert.doesNotMatch(source,/(?:update|insert|delete).*invoices/i);
}
console.log('Product reviews storefront V140 contract: OK');
