import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const life=readFileSync('supabase/migrations/20261003_kinto_deals_v1_g5i_redemption_payment_lifecycle_off.sql','utf8');
const quota=readFileSync('supabase/migrations/20261003_kinto_deals_v1_g5i_paid_only_campaign_quota_off.sql','utf8');
const g21=readFileSync('supabase/migrations/20261006_kinto_deals_v1_g21_availability_history.sql','utf8');

for(const x of ["state='confirmed'","v_used>=v_c.max_uses_per_customer","v_allocated>=v_c.max_total_redemptions","DEALS_PAID_ALLOCATION_EXHAUSTED","for update nowait"])
  assert.ok(life.includes(x),x);
assert.ok(life.includes("new.status='تم التسديد'"));
assert.ok(life.includes("bundle_stock_lifecycle_state'='deducted'"));
assert.ok(!life.includes("state in ('pending','confirmed')"),'pending requests must not consume paid quota');
assert.ok(quota.includes("state='confirmed'"));
assert.ok(!quota.includes("state in ('pending','confirmed')"));
assert.ok(g21.includes("state in ('pending','confirmed')"),'public feed must fail closed while a pending order can still win');
assert.ok(g21.includes("code','quota_exhausted'"));
assert.ok(!/update\s+public\.local_products/i.test(life),'campaign lifecycle must not mutate inventory');
assert.ok(!/update\s+public\.orders/i.test(life),'campaign lifecycle must not rewrite order lifecycle');
console.log('G21E allocation/quota/race static contract PASS');
