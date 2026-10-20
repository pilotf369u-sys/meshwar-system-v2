import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const migration=readFileSync('supabase/migrations/20261020090000_kinto_payment_p5_available_coupons.sql','utf8');
const ui=readFileSync('js/customer-payment-p5.js','utf8');

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

const exposedUi=ui.replace(
  "window.KintoPaymentP5V1={call,checkout,isElectronic,getMode,loadPayments,version:'p5-simulator-v1'};",
  "window.KintoPaymentP5V1={call,checkout,isElectronic,getMode,loadPayments,reviewHtml,version:'p5-simulator-v1'};"
);
assert.notEqual(exposedUi,ui,'renderer can be exercised in this isolated test');
const window={};
vm.runInNewContext(exposedUi,{window,document:{},console,fetch:async()=>{throw new Error('not called')}});
const line={store_id:'store-a',store_name:'Test store',product_name:'Product',product_image:'',quantity:1,unit_price_local:10000,line_total_local:10000,currency:'IQD',selected_options:{}};
const hidden=window.KintoPaymentP5V1.reviewHtml({lines:[line],amount:10000,currency:'IQD',available_coupon_points:{'store-a':[]}}, {});
assert.doesNotMatch(hidden,/<select data-coupon-store=/,'no coupon dropdown appears when none is available');
assert.match(hidden,/لا توجد قسائم متاحة لهذا المتجر/);
const available=window.KintoPaymentP5V1.reviewHtml({lines:[line],amount:7000,currency:'IQD',available_coupon_points:{'store-a':[3000]}}, {});
assert.match(available,/<option value="3000"/,'available store tier appears');
assert.doesNotMatch(available,/<option value="1000"|<option value="5000"/,'unavailable tiers stay hidden');


const noDiscount = window.KintoPaymentP5V1.reviewHtml({
  lines:[line],amount:10000,currency:'IQD',coupon_points:{'store-a':0},
  available_coupon_points:{'store-a':[]}
}, {});
assert.doesNotMatch(noDiscount,/<del>/,'without a selected coupon, no crossed-out total appears');

const secondLine={...line,store_id:'store-b',store_name:'Second test store',product_name:'Second product',unit_price_local:20000,line_total_local:20000};
const discounted=window.KintoPaymentP5V1.reviewHtml({
  lines:[line,secondLine],amount:27000,currency:'IQD',
  coupon_points:{'store-a':3000,'store-b':0},
  available_coupon_points:{'store-a':[3000],'store-b':[]}
}, {'store-a':3000});
assert.ok(discounted.includes('<span>مجموع المنتجات قبل القسيمة</span><del>10,000 IQD</del>'),'discounted store shows its original total crossed out');
assert.ok(discounted.includes('<span>خصم القسيمة</span><b>−3,000 IQD</b>'),'store discount is itemized');
assert.ok(discounted.includes('<span>مجموع المتجر بعد القسيمة</span><b>7,000 IQD</b>'),'store net total is displayed');
assert.ok(discounted.includes('<span>مجموع المنتجات</span><b>20,000 IQD</b>'),'unselected store total stays unchanged');
assert.ok(discounted.includes('<span>الإجمالي قبل القسائم</span><div><del>30,000 IQD</del><strong>27,000 IQD</strong></div>'),'grand total shows original and server-quoted discounted total');
assert.ok(discounted.includes('إجمالي الخصم: −3,000 IQD'),'grand discount is explicit');
assert.equal((discounted.match(/<del>/g)||[]).length,2,'only discounted store plus grand total are crossed out');

console.log('PASS: server-derived coupon eligibility contract and review-render behavior (no live database write).');
