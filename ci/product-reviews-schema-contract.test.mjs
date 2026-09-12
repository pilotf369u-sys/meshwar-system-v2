import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'supabase/migrations/20260911_v131_product_reviews_schema.sql',
  'supabase/migrations/20260911_v132_product_reviews_customer_contract.sql',
  'supabase/migrations/20260912_v136_product_review_pgcrypto_path_fix.sql',
  'supabase/migrations/20260912_v137_product_review_order_customer_compat.sql',
  'supabase/migrations/20260911_v133_product_reviews_public_read.sql',
  'supabase/migrations/20260911_v134_product_review_storage_bucket.sql'
];
const sql = files.map(file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
const preflight = readFileSync(new URL('../supabase/read-only/20260911_product_reviews_preflight.sql', import.meta.url), 'utf8');

assert.match(sql, /create table if not exists public\.product_reviews/i);
assert.match(sql, /create table if not exists public\.product_review_images/i);
assert.match(sql, /create table if not exists public\.customer_review_sessions/i);
assert.match(sql, /create table if not exists public\.customer_review_login_attempts/i);
assert.match(sql, /trim\(coalesce\(o\.status, ''\)\) = 'تم التسليم'/);
assert.match(sql, /trim\(o\.customer_id::text\) = p_customer_id::text/);
assert.match(sql, /PRODUCT_NOT_FOUND_IN_DELIVERED_ORDER/);
assert.match(sql, /unique \(customer_id, order_id, product_reference\)/i);
assert.match(sql, /digest\(p_session_token, 'sha256'\)/i);
assert.match(sql, /pg_advisory_xact_lock/i);
assert.match(sql, /v_failed_attempts >= 5/i);
assert.match(sql, /moderation_status = 'published'/i);
assert.match(sql, /'product-review-images',[\s\S]*?false,[\s\S]*?5242880/i);
assert.match(sql, /on conflict \(id\) do nothing/i);
assert.doesNotMatch(sql, /revoke all on schema private/i);

for (const forbidden of [
  /alter table public\.orders/i,
  /update public\.orders/i,
  /insert into public\.orders/i,
  /delete from public\.orders/i,
  /create trigger[\s\S]*on public\.orders/i,
  /alter table public\.employees/i,
  /alter table public\.invoices/i
]) {
  assert.doesNotMatch(sql, forbidden);
}

assert.match(preflight, /begin transaction read only/i);
assert.match(preflight, /information_schema\.columns/i);
assert.match(preflight, /to_regclass\('public\.orders'\)/i);
assert.match(preflight, /commit;/i);
assert.doesNotMatch(preflight, /\b(?:create|alter|drop|truncate|insert|update|delete|grant|revoke)\s+(?:table|schema|function|policy|into|from|on|public\.)/i);

console.log('Product reviews additive schema contract: OK');
