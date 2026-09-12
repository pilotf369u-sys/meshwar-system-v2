import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const js=readFileSync(new URL('../js/admin-product-reviews-v138.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20260912_v152_admin_review_media_controls.sql',import.meta.url),'utf8');
assert.match(js,/item\.store_name/);assert.match(js,/data-admin-review-preview/);assert.match(js,/data-delete-review-image/);assert.match(js,/admin_delete_product_review_image_v152/);
assert.match(sql,/left join public\.local_stores/);assert.match(sql,/store_name/);assert.match(sql,/admin_delete_product_review_image_v152/);assert.match(sql,/product_review_storage_deletions_v150/);
assert.doesNotMatch(sql,/(update|insert into|delete from) public\.(orders|customers|local_products|invoices|order_store_segments)/i);
console.log('Admin review media V152 contract: OK');
