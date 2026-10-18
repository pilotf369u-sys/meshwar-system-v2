import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/kinto-payment-review-g20.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261018194000_kinto_payment_review_quote_g20.sql', import.meta.url), 'utf8');

function loadReviewModule() {
  const listeners = new Map();
  const alerts = [];
  const window = {};
  const document = {
    addEventListener(name, listener, capture) { listeners.set(`${name}:${Boolean(capture)}`, listener); },
  };
  vm.runInNewContext(source, { window, document, alert: message => alerts.push(message), console });
  return { api: window.KintoPaymentReviewG20, listeners, alerts };
}

test('cart payload contains only selected IDs, options and quantities', () => {
  const { api } = loadReviewModule();
  const actual = api.mapCartItems([
    { store_id: 's1', product_id: 'p1', quantity: 2.9, selected_options: { color: 'أخضر', size: 'M', volume: '500ml' }, unit_price_local: 99000, image_url: 'https://example.test/p.png' },
    { store_id: 's2', product_id: 'p2', quantity: 3, selected: false },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), [{
    store_id: 's1', product_id: 'p1', quantity: 2,
    selected_options: { color: 'أخضر', size: 'M', volume: '500ml' },
  }]);
});

test('coupon eligibility keeps vendor coupons store-scoped and allows campaign scope', () => {
  const { api } = loadReviewModule();
  const coupons = [
    { store_id: 's1', currency: 'IQD', status: 'active', points: 1000 },
    { store_id: 's9', currency: 'IQD', status: 'active', points: 5000 },
    { store_id: 's8', currency: 'IQD', status: 'active', points: 3000, campaign_store_ids: ['s1', 's2'] },
    { store_id: 's1', currency: 'USD', status: 'active', points: 5000 },
    { store_id: 's1', currency: 'IQD', status: 'used', points: 5000 },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(api.eligibleCouponTiers({ store_id: 's1', currency: 'IQD', max_coupon_minor: 3000 }, coupons))), [1000, 3000]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.eligibleCouponTiers({ store_id: 's2', currency: 'IQD', max_coupon_minor: 5000 }, coupons))), [1000, 3000]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.eligibleCouponTiers({ store_id: 's1', currency: 'USD', max_coupon_minor: 5000 }, coupons))), []);
});

test('checkout interception is limited to the cart checkout button', () => {
  const { listeners, alerts } = loadReviewModule();
  const intercept = listeners.get('click:true');
  let stopped = false;
  const directDealEvent = { target: { closest: () => null }, preventDefault() { throw new Error('unexpected preventDefault'); }, stopImmediatePropagation() { stopped = true; } };
  intercept(directDealEvent);
  assert.equal(stopped, false);
  const cartEvent = { target: { closest: selector => selector === '#kintoLocalCartCheckout' ? {} : null }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { stopped = true; } };
  intercept(cartEvent);
  assert.equal(cartEvent.prevented, true);
  assert.equal(stopped, true);
  assert.equal(alerts.length, 1); // no customer session was supplied to this isolated test
});

test('G20 quote migration is review-only and leaves order, payment and stock engines untouched', () => {
  assert.match(migration, /private\.require_customer_review_session\(p_session_token\)/);
  assert.match(migration, /electronic_available',false/);
  assert.match(migration, /shipping_included',false/);
  assert.match(migration, /unit_price_minor/);
  assert.match(migration, /kinto_payment_quotes_g20/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.orders/i);
  assert.doesNotMatch(migration, /update\s+public\.local_products/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.kinto_payment_(intents|events)/i);
  assert.doesNotMatch(migration, /\bstatus\s*=\s*'تم التسديد'/);
});
