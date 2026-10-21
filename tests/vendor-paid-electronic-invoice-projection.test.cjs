const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261020210000_kinto_vendor_paid_electronic_invoice_v1.sql'), 'utf8');
const start = migration.indexOf('create or replace function public.vendor_paid_electronic_invoice_orders_v1');
const end = migration.indexOf('$invoice_access$;', start);
assert(start >= 0 && end > start, 'the existing read-only server proof RPC is present');
const body = migration.slice(start, end);

assert.match(body, /private\.require_vendor_session\(p_session_token\)/,
  'the RPC authenticates the vendor session server-side');
assert.match(body, /p\.status='paid'/);
assert.match(body, /p\.payment_kind='cart'/);
assert.match(body, /a\.status='succeeded'/);
assert.match(body, /o\.id=any\(p\.order_ids\)/);
assert.match(body, /p\.customer_id=o\.customer_id/);
assert.match(body, /parsed\.details_json->>'store_id'=v_store_id::text/);
assert.match(body, /not exists\s*\([\s\S]*lp\.store_id<>v_store_id/,
  'any order containing a product from another store is excluded');
assert.doesNotMatch(body, /\b(insert|update|delete)\s+(?:into\s+)?(?:public\.)?orders\b/i,
  'the invoice proof does not mutate orders');
assert.match(migration, /revoke all on function public\.vendor_paid_electronic_invoice_orders_v1/);
assert.match(migration, /grant execute on function public\.vendor_paid_electronic_invoice_orders_v1[\s\S]*to anon,authenticated/);

console.log('PASS existing vendor invoice proof RPC remains read-only, session-bound, tied to a succeeded paid cart KP, and scoped to one store.');
