import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g5b_customer_quote_readonly_off.sql',import.meta.url),'utf8');
test('G5B fail-closed session and feature gate, read-only estimate',()=>{
 for(const x of ['private.require_customer_review_session(p_session_token)',"'merchant_deals_enabled'","'feature_disabled'","v_latest.review_state<>'acknowledged'","e.decision='approved'","state in ('pending','confirmed')","'binding',false","'reservation_created',false","'exclusive_items_only'"])assert.ok(s.includes(x),x);
 assert.ok(s.indexOf('private.require_customer_review_session')<s.indexOf("'merchant_deals_enabled'"));
 assert.doesNotMatch(s,/\b(insert\s+into|update\s+public\.|delete\s+from|create\s+trigger|alter\s+table|drop\s+trigger)\b/i);
 assert.doesNotMatch(s,/checkout_independent_vendor_orders\s*\(|customer_apply_coupon_v310\s*\(/);
});
