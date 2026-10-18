import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/kinto-payment-review-g20.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261018194000_kinto_payment_review_quote_g20.sql', import.meta.url), 'utf8');
const migrationB = readFileSync(new URL('../supabase/migrations/20261018210000_kinto_payment_review_quote_g20b.sql', import.meta.url), 'utf8');
const legacyPricingSource = readFileSync(new URL('../js/local-store-pricing.js', import.meta.url), 'utf8');

function loadReviewModule() {
  const listeners = new Map();
  const alerts = [];
  const window = {};
  const document = {
    addEventListener(name, listener, capture) { listeners.set(`${name}:${Boolean(capture)}`, listener); },
  };
  vm.runInNewContext(source, { window, document, alert: message => alerts.push(message), console, URL });
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

test('legacy V97 pricing outputs match the review quote at real values and rounding edges', () => {
  const window = {};
  vm.runInNewContext(legacyPricingSource.split('/* PUBLIC_SITE_SETTINGS_CMS_V3 */')[0], { window });
  const pricing = window.MeshwarLocalPricing;
  // These expected values follow V97: ceil USD after commission, then ceil local currency to 1,000.
  assert.equal(pricing.customerPriceUSD(9, 10), 10);
  assert.equal(pricing.customerPriceLocal(9, 10, 1500), 15000); // exact thousand boundary
  assert.equal(pricing.customerPriceUSD(9.0001, 10), 11); // immediately across USD ceiling
  assert.equal(pricing.customerPriceLocal(9.0001, 10, 1500), 17000); // then local ceil
  assert.equal(pricing.customerPriceLocal(9, 10, 1500.0001), 16000); // immediately over local boundary
  assert.equal(pricing.customerPriceLocal(12, 10, 1500), 21000);
  assert.equal(pricing.customerPriceLocal(9.01, 10, 1500), 17000);
  assert.equal((pricing.customerPriceLocal(12, 10, 1500) - pricing.customerPriceLocal(9.01, 10, 1500)) * 3, 12000);
  const couponCap = subtotal => Math.floor(subtotal * 0.1 / 1000) * 1000;
  assert.equal(couponCap(51000), 5000);
  assert.equal(couponCap(50999), 5000);
  assert.equal(couponCap(49999), 4000);
  // The G20 SQL calculates the same V97 staged ceilings and keeps old-price savings separate.
  assert.match(migrationB, /regular_unit_price_minor/);
  assert.match(migrationB, /product_discount_minor/);
  assert.match(migrationB, /ceil\(\(ceil\(coalesce\(p\.discount_price,p\.base_price\)::numeric/);
});

test('manual fallback is single-flight and keeps cart data when legacy checkout fails', async () => {
  const cart = { items: [{ product_id: 'p1', quantity: 2 }], calls: 0 };
  let release;
  cart.checkout = () => {
    cart.calls += 1;
    return new Promise(resolve => { release = () => resolve({ ok: false, error: new Error('offline') }); });
  };
  // A failed/missing quote does not touch the manual order engine or the cart.
  // Load the module with the current test cart so its actual fallback callback is exercised.
  const context = loadReviewModuleWithCart(cart);
  const first = context.api.manualFallback();
  const second = await context.api.manualFallback();
  assert.equal(second.skipped, true);
  assert.equal(cart.calls, 1);
  release();
  const result = await first;
  assert.equal(result.ok, false);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.calls, 1);
});

function loadReviewModuleWithCart(cart) {
  const listeners = new Map();
  const window = { KintoLocalCartV93: cart };
  const document = { addEventListener(name, listener, capture) { listeners.set(`${name}:${Boolean(capture)}`, listener); } };
  vm.runInNewContext(source, { window, document, alert() {}, console, URL });
  return { api: window.KintoPaymentReviewG20, listeners };
}

test('G20-B leaves mixed-currency totals in each store currency and blocks one-currency payment amount', () => {
  assert.match(migrationB, /per_store_currency_manual_only/);
  assert.match(migrationB, /totals_by_currency/);
  assert.match(migrationB, /currency is null and amount is null/);
  assert.doesNotMatch(migrationB, /PAYMENT_QUOTE_MIXED_CURRENCY_UNSUPPORTED/);
});

test('currency policy preserves independent store totals without conversion', () => {
  const { api } = loadReviewModule();
  assert.deepEqual(JSON.parse(JSON.stringify(api.currencyTotals([
    { currency: 'IQD', subtotal_minor: 51000, discount_minor: 3000, payable_minor: 48000 },
    { currency: 'USD', subtotal_minor: 18, discount_minor: 0, payable_minor: 18 },
    { currency: 'IQD', subtotal_minor: 22000, discount_minor: 1000, payable_minor: 21000 },
  ]))), [
    { currency: 'IQD', subtotal_minor: 73000, discount_minor: 4000, payable_minor: 69000 },
    { currency: 'USD', subtotal_minor: 18, discount_minor: 0, payable_minor: 18 },
  ]);
});

test('server quote refuses production and requires an explicitly isolated Supabase backend', () => {
  const { api } = loadReviewModule();
  assert.throws(() => api.testBackendConfig(undefined), /PAYMENT_REVIEW_ISOLATED_BACKEND_REQUIRED/);
  assert.throws(() => api.testBackendConfig({ environment: 'isolated', projectRef: 'hsmmbloouskqdnptiiad', url: 'https://hsmmbloouskqdnptiiad.supabase.co', key: 'test' }), /PAYMENT_REVIEW_UNSAFE_BACKEND/);
  assert.deepEqual(JSON.parse(JSON.stringify(api.testBackendConfig({ environment: 'isolated', projectRef: 'kinto-payment-sandbox', url: 'https://kinto-payment-sandbox.supabase.co', key: 'sandbox-key' }))), {
    url: 'https://kinto-payment-sandbox.supabase.co', key: 'sandbox-key',
  });
});
