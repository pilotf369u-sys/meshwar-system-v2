import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../js/customer-product-reviews-v135.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/customer-product-reviews-v135.css', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/product-review-image-upload/index.ts', import.meta.url), 'utf8');
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const login = readFileSync(new URL('../login.html', import.meta.url), 'utf8');

assert.match(dashboard, /customer-product-reviews-v135\.css/);
assert.match(dashboard, /customer-product-reviews-v135\.js/);
assert.match(client, /customer_review_ready_products_v132/);
assert.match(client, /pageSize:\s*6/);
assert.match(client, /id="reviewPager"/);
assert.match(client, /customer_submit_product_review_v132/);
assert.match(client, /تم حفظ التقييم بحالة «قيد المراجعة»/);
assert.match(client, /customer\?\.customer_code/);
assert.match(client, /ready-products RPC completed/);
assert.match(client, /diagnostics:/);
assert.match(client, /review-order-action/);
assert.match(login, /customer_review_login_v132/);
assert.match(login, /kinto_customer_review_session_v132/);
assert.match(client, /activateReviewsTab/);
assert.match(client, /window\.switchCustomerTab/);
assert.match(client, /capture="environment"/);
assert.match(client, /accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(client, /MAX_FILE_BYTES = 5 \* 1024 \* 1024/);
assert.match(client, /MAX_IMAGES = 5/);
assert.match(client, /sessionStorage\.setItem\(SESSION_KEY/);
assert.doesNotMatch(client, /localStorage\.setItem\(SESSION_KEY/);
assert.match(css, /backdrop-filter:blur/);
assert.match(css, /@media\(max-width:700px\)/);

assert.match(edge, /customer_review_sessions/);
assert.match(edge, /product_reviews/);
assert.match(edge, /product_review_images/);
assert.match(edge, /product-review-images/);
assert.match(edge, /validSignature/);
assert.match(edge, /file\.size > MAX_BYTES/);
assert.match(edge, /eq\('customer_id', session\.customer_id\)/);
assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(config, /\[functions\.product-review-image-upload\][\s\S]*verify_jwt = false/);
assert.doesNotMatch(dashboard, /btn-review-trigger/);
assert.equal((dashboard.match(/id=["']customerReviewModal["']/g) || []).length, 0);
assert.doesNotMatch(dashboard, /\.from\(['"](?:reviews|product_reviews|product_review_images)['"]\)/);

for (const source of [client, edge]) {
  assert.doesNotMatch(source, /(?:update|insert|delete).*orders/i);
  assert.doesNotMatch(source, /(?:update|insert|delete).*employees/i);
  assert.doesNotMatch(source, /(?:update|insert|delete).*invoices/i);
}

console.log('Product reviews phase-two isolated contract: OK');
