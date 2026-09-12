import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const js=readFileSync(new URL('../js/customer-product-reviews-v135.js',import.meta.url),'utf8'),sql=readFileSync(new URL('../supabase/migrations/20260912_v154_customer_review_display_context.sql',import.meta.url),'utf8');
assert.match(js,/customer_review_display_context_v154/);assert.match(js,/item\.store_name/);assert.match(js,/item\.order_display/);assert.match(js,/سبب الرفض/);
assert.match(sql,/rejection_reason/);assert.match(sql,/order_display/);assert.match(sql,/left join public\.local_stores/);assert.match(sql,/left join public\.orders/);
assert.doesNotMatch(sql,/(update|insert into|delete from) public\.(orders|customers|local_products|invoices|order_store_segments)/i);
console.log('Customer review V154 display context contract: OK');
