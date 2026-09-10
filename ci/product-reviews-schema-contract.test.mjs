import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'supabase/migrations/20260911_v131_product_reviews_schema.sql',
  'supabase/migrations/20260911_v132_product_reviews_customer_contract.sql',
  'supabase/migrations/20260911_v133_product_reviews_public_read.sql',
  'supabase/migrations/20260911_v134_product_review_storage_bucket.sql'
];
const sql = files.map(file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');

assert.match(sql, /create table if not exists public\.product_reviews/i);
assert.match(sql, /create table if not exists public\.product_review_images/i);
assert.match(sql, /create table if not exists public\.customer_review_sessions/i);
assert.match(sql, /trim\(coalesce\(o\.status, ''\)\) = 'تم التسليم'/);
assert.match(sql, /o\.customer_id = p_customer_id/);
assert.match(sql, /PRODUCT_NOT_FOUND_IN_DELIVERED_ORDER/);
assert.match(sql, /unique \(customer_id, order_id, product_reference\)/i);
assert.match(sql, /digest\(p_session_token, 'sha256'\)/i);
assert.match(sql, /moderation_status = 'published'/i);
assert.match(sql, /public = false/i);

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

console.log('Product reviews additive schema contract: OK');
