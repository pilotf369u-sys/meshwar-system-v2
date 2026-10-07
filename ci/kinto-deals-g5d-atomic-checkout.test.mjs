import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const sql=readFileSync('supabase/migrations/20261002_kinto_deals_v1_g5d_atomic_no_gift_checkout_off.sql','utf8');
for(const s of ['require_customer_review_session','merchant_deals_enabled','gift_product_id is not null','for update','checkout_independent_vendor_orders_v101','kinto_deals_v1_reserve_canonical_order_g5','on conflict(customer_id,request_id) do nothing','DEALS_IDEMPOTENCY_KEY_REUSED','revoke all on function','grant execute on function']) assert.ok(sql.includes(s),s);
assert.ok(!/create\s+trigger/i.test(sql),'no order triggers');
assert.ok(!/update\s+public\.orders/i.test(sql),'no order mutation');
assert.ok(!/set\s+enabled\s*=\s*true/i.test(sql),'flag remains OFF');
console.log('G5D static isolation/atomic checkout contract: PASS (13 checks)');
