import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const migration=readFileSync('supabase/migrations/20261020090000_kinto_payment_p5_available_coupons.sql','utf8');
const ui=readFileSync('js/customer-payment-p5.js','utf8');
const pages=['index.html','local-stores.html','store.html'].map(path=>readFileSync(path,'utf8'));

assert.match(migration,/private\.require_customer_review_session\(p_session_token\)/,'public quote derives customer identity from the session');
assert.match(migration,/private\.kinto_payment_p5_quote_v1\(cid,p_items,p_coupon_points\)/,'coupon UI options are based on server-priced cart lines');
assert.match(migration,/q\.customer_id=p_customer::text/,'coupon lookup is limited to the signed-in customer');
assert.match(migration,/q\.currency=v_currency/,'coupon currency must match the cart');
assert.match(migration,/q\.status='active'[\s\S]*q\.expires_at>now\(\)/,'expired or inactive coupons are excluded');
assert.match(migration,/not exists\([\s\S]*kinto_payment_coupon_holds_p5/,'coupons already held by another payment attempt are excluded');
assert.match(migration,/q\.store_id=v_store\.store_id::text/,'store coupons are scoped to that store');
assert.match(migration,/kinto_campaign_stores[\s\S]*cs\.store_id=v_store\.store_id::text/,'campaign coupons require store participation');
assert.match(migration,/floor\(coalesce\(v_store\.product_total,0\)\*0\.10\)/,'coupon tier respects the server-calculated ten-percent cap');
assert.match(migration,/'available_coupon_points',v_options/,'server returns available tiers per store');
assert.match(migration,/customer_id',null/,'customer identity is not returned to the browser');
assert.match(migration,/revoke all on function private\.kinto_payment_p5_coupon_options_v1/i,'private options function is not client-callable');

assert.match(ui,/q\.available_coupon_points\?\.\[sid\]/,'review UI reads server-calculated options for each store');
assert.match(ui,/لا توجد قسائم متاحة لهذا المتجر/,'empty availability has a clear per-store state');
assert.doesNotMatch(ui,/\[1000,3000,5000\]\.map\(/,'UI no longer offers hard-coded tiers to every store');
assert.match(ui,/tiers\.map\(v=>/,'only server-returned tiers are rendered as options');
for(const page of pages) assert.match(page,/customer-payment-p5\.js\?v=20261020-coupon-availability-v1/,'checkout script cache is refreshed');

console.log('PASS: coupon dropdown options are server-derived, customer/store/campaign scoped, and hidden when none are available (SQL/UI contract; no live database write).');
