import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const s=readFileSync('supabase/migrations/20261003_kinto_deals_v1_g5i_redemption_payment_lifecycle_off.sql','utf8');
for(const x of ['after update of status on public.orders',"r.state='pending'","new.status='تم التسديد'","bundle_stock_lifecycle_state","state='confirmed'","state='released'","old.status<>'تم التسديد'","canonical_pre_payment_cancellation","r.frozen_snapshot||jsonb_build_object","return new"])assert.ok(s.includes(x),x);
assert.ok(!/update\s+public\.orders/i.test(s));
assert.ok(!/update\s+public\.local_products/i.test(s));
assert.ok(!/state\s*=\s*'reversed'/i.test(s));
console.log('G5I payment lifecycle static contract PASS (13 checks)');
