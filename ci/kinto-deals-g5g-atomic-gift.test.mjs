import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const s=readFileSync('supabase/migrations/20261002_kinto_deals_v1_g5g_atomic_gift_checkout_off.sql','utf8');
for(const x of ['begin;','commit;','DEALS_GIFT_SNAPSHOT_MISSING','DEALS_GIFT_SNAPSHOT_INVALID','DEALS_UNEXPECTED_GIFT','jsonb_agg(x)','gift_line','gift_fulfilled',"'app.kinto_deals_gift_campaign_id'","'app.kinto_deals_verified_customer_id'",'checkout_independent_vendor_orders_v101','kinto_deals_v1_reserve_canonical_order_g5','DEALS_IDEMPOTENCY_KEY_REUSED'])assert.ok(s.includes(x),x);
assert.ok(s.indexOf('create or replace function private.kinto_deals_v1_reserve_canonical_order_g5')<s.indexOf('create or replace function public.kinto_deals_v1_checkout_no_gift_g5d'));
assert.ok(s.indexOf("perform set_config('app.kinto_deals_gift_campaign_id','',true)")>s.indexOf('v_checkout:=public.checkout_independent_vendor_orders_v101'));
assert.ok(!/create\s+trigger/i.test(s));assert.ok(!/update\s+public\.orders/i.test(s));assert.ok(!/set\s+enabled\s*=\s*true/i.test(s));
console.log('G5G gift+checkout integration isolation contract PASS (18 checks)');
