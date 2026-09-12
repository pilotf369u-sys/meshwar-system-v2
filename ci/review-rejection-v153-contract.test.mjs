import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const admin=readFileSync(new URL('../js/admin-product-reviews-v138.js',import.meta.url),'utf8'),customer=readFileSync(new URL('../js/customer-product-reviews-v135.js',import.meta.url),'utf8'),css=readFileSync(new URL('../css/admin-product-reviews-v138.css',import.meta.url),'utf8'),sql=readFileSync(new URL('../supabase/migrations/20260912_v153_review_rejection_notices.sql',import.meta.url),'utf8');
assert.match(admin,/admin-review-reason/);assert.match(admin,/typed\|\|reason/);assert.match(css,/data-delete-review-image/);assert.match(css,/overflow:visible!important/);
assert.match(customer,/customer_review_rejection_notices_v153/);assert.match(customer,/review-rejection-notification/);
assert.match(sql,/customer_review_rejection_notices_v153/);assert.match(sql,/المحتوى لا يستوفي إرشادات تقييمات KINTO/);assert.match(sql,/moderation_status='rejected'/);
assert.doesNotMatch(sql,/(update|insert into|delete from) public\.(orders|customers|local_products|invoices|order_store_segments)/i);
console.log('Review rejection V153 contract: OK');
