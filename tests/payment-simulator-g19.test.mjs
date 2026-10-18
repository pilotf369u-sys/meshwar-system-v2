import test from 'node:test';
import assert from 'node:assert/strict';
import { KintoPaymentSimulator } from './support/payment-simulator-g19.mjs';

const secret = 'g19-isolated-simulator-test-secret-at-least-32';
const productionProjectRef = 'hsmmbloouskqdnptiiad';
const baseNow = 1_800_000_000_000;
const catalog = [
  { sku: 'store-a:item-1', productId: 'p-a1', name: 'Item A', storeId: 'store-a', storeName: 'Store A', unitMinor: 10_000, currency: 'IQD', stock: 5, active: true },
  { sku: 'store-b:item-2', productId: 'p-b1', name: 'Item B', storeId: 'store-b', storeName: 'Store B', unitMinor: 5_000, currency: 'IQD', stock: 4, active: true },
];
const coupons = [{ code: 'A10', storeId: 'store-a', active: true, kind: 'basis_points', basisPoints: 1_000 }];

function createSimulator({ now = () => baseNow, ...overrides } = {}) {
  return new KintoPaymentSimulator({ environment: 'isolated', projectRef: 'kin-test-branch-01', productionProjectRef, secret, catalog: structuredClone(catalog), coupons: structuredClone(coupons), now, ...overrides });
}

async function checkout(simulator, { couponCodes = [], items = [{ sku: catalog[0].sku, quantity: 1 }, { sku: catalog[1].sku, quantity: 1 }] } = {}) {
  const quote = await simulator.quote({ customerId: 'customer-1', items, couponCodes });
  const reservation = await simulator.reserve(quote.id);
  return { quote, reservation };
}

async function signWebhook(event) {
  const rawBody = JSON.stringify(event);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { rawBody, signature };
}

test('simulator fails closed outside an explicitly isolated, non-production project', () => {
  const common = { projectRef: 'kin-test-branch-01', productionProjectRef, secret, catalog };
  assert.throws(() => new KintoPaymentSimulator({ ...common, environment: 'production' }), { code: 'ISOLATED_PROJECT_REQUIRED' });
  assert.throws(() => new KintoPaymentSimulator({ ...common, environment: 'isolated', projectRef: productionProjectRef }), { code: 'ISOLATED_PROJECT_REQUIRED' });
  assert.throws(() => new KintoPaymentSimulator({ ...common, environment: 'isolated', secret: 'short' }), { code: 'SIMULATOR_SECRET_REQUIRED' });
  assert.throws(() => new KintoPaymentSimulator({ ...common, environment: 'isolated', catalog: [] }), { code: 'SERVER_CATALOG_REQUIRED' });
});

test('server quote, reserve and success create one paid order and invoice per store', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  const { quote, reservation } = await checkout(simulator, { couponCodes: ['A10'] });
  assert.equal(quote.amountMinor, 14_000);
  assert.equal(quote.shippingIncluded, false);
  assert.equal(reservation.status, 'active');

  const intent = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-success-01' });
  assert.equal(intent.status, 'captured');
  assert.equal(intent.providerKey, 'kinto-simulator-g19');
  assert.equal(intent.providerEnvironment, 'isolated');
  assert.equal(intent.orders.length, 2);
  const [orderA] = simulator.visibleOrdersFor('store-a');
  const [orderB] = simulator.visibleOrdersFor('store-b');
  assert.equal(orderA.status, 'تم التسديد');
  assert.equal(orderB.status, 'تم التسديد');
  assert.match(orderA.orderCode, /^KN-\d{6}$/);
  assert.match(orderB.orderCode, /^KN-\d{6}$/);
  assert.notEqual(orderA.orderCode, orderB.orderCode);
  assert.equal(simulator.visibleOrdersFor('store-c').length, 0);
  assert.equal(simulator.invoiceFor(orderA.id, 'other-customer'), null);
  assert.equal(simulator.invoiceFor(orderA.id, 'customer-1').totalMinor, 9_000);
  assert.deepEqual(simulator.invoicesForStore('store-b').map(invoice => invoice.totalMinor), [5_000]);
  assert.equal(simulator.stockFor(catalog[0].sku), 4);
  assert.equal(simulator.stockFor(catalog[1].sku), 3);
  assert.equal(simulator.stockDeductionsFor(catalog[0].sku), 1);
  assert.equal(simulator.stockDeductionsFor(catalog[1].sku), 1);
  assert.equal(simulator.customerPayments('customer-1')[0].status, 'captured');
  assert.equal(simulator.reservationFor(quote.id).status, 'consumed');
});

test('declined payment releases its hold and leaves orders, invoices and stock unchanged', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  const { quote } = await checkout(simulator);
  const intent = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-decline-01', scenario: 'decline' });
  assert.equal(intent.status, 'failed');
  assert.equal(simulator.reservationFor(quote.id).status, 'released');
  assert.deepEqual(simulator.counts(), { intents: 1, events: 1, orders: 0, invoices: 0 });
  assert.equal(simulator.stockFor(catalog[0].sku), 5);
  assert.equal(simulator.customerPayments('customer-1')[0].status, 'failed');
});

test('concurrent cart reservations cannot oversell the server-side SKU stock', async () => {
  const simulator = createSimulator({ catalog: [{ ...catalog[0], stock: 1 }] });
  const carts = await Promise.all([
    simulator.quote({ customerId: 'customer-1', items: [{ sku: catalog[0].sku, quantity: 1 }] }),
    simulator.quote({ customerId: 'customer-2', items: [{ sku: catalog[0].sku, quantity: 1 }] }),
  ]);
  const results = await Promise.allSettled(carts.map(quote => simulator.reserve(quote.id)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'INSUFFICIENT_STOCK').length, 1);
});

test('delay survives manual fallback for the existing intent while blocking new payment attempts', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  const { quote } = await checkout(simulator);
  const pending = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-delay-01', scenario: 'delay' });
  assert.equal(pending.status, 'pending');
  simulator.setPaymentMode('manual');
  const second = await checkout(simulator, { items: [{ sku: catalog[0].sku, quantity: 1 }] });
  await assert.rejects(simulator.createPayment({ quoteId: second.quote.id, idempotencyKey: 'journey-after-fallback-01' }), { code: 'NEW_PAYMENTS_PAUSED' });
  const settled = await simulator.deliverDelayed(pending.id);
  assert.equal(settled.status, 'captured');
  assert.equal(simulator.visibleOrdersFor('store-a').length, 1);
  assert.equal(simulator.visibleOrdersFor('store-b').length, 1);
  assert.equal(simulator.stockFor(catalog[0].sku), 4);
});

test('global and provider emergency stops block new intents independently', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  let cart = await checkout(simulator, { items: [{ sku: catalog[0].sku, quantity: 1 }] });
  simulator.pauseAll('Incident response test');
  await assert.rejects(simulator.createPayment({ quoteId: cart.quote.id, idempotencyKey: 'global-stop-01' }), { code: 'NEW_PAYMENTS_PAUSED' });
  simulator.resumeForTests();
  cart = await checkout(simulator, { items: [{ sku: catalog[1].sku, quantity: 1 }] });
  simulator.pauseProvider('Provider health test');
  await assert.rejects(simulator.createPayment({ quoteId: cart.quote.id, idempotencyKey: 'provider-stop-01' }), { code: 'NEW_PAYMENTS_PAUSED' });
  assert.equal(simulator.counts().intents, 0);
  assert.equal(simulator.runtime().new_payments_paused, false);
  assert.equal(simulator.runtime().active_provider_paused, true);
});

test('duplicate notifications and idempotent retries never duplicate capture, invoice, order or stock effects', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  const { quote } = await checkout(simulator, { items: [{ sku: catalog[0].sku, quantity: 1 }] });
  const first = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-duplicate-01', scenario: 'duplicate' });
  const retry = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-duplicate-01', scenario: 'success' });
  assert.equal(retry.id, first.id);
  await assert.rejects(simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-second-charge-01' }), { code: 'ACTIVE_RESERVATION_REQUIRED' });
  const secondCapture = { providerKey: first.providerKey, providerEventId: 'independent-repeat-capture', intentId: first.id,
    providerReference: first.providerReference, amountMinor: first.amountMinor, currency: first.currency, status: 'captured', createdAt: baseNow };
  const replay = await simulator.receiveWebhook(await signWebhook(secondCapture));
  assert.equal(replay.duplicate, true);
  assert.deepEqual(simulator.counts(), { intents: 1, events: 2, orders: 1, invoices: 1 });
  assert.equal(simulator.stockFor(catalog[0].sku), 4);
  assert.equal(simulator.stockDeductionsFor(catalog[0].sku), 1);
});

test('late capture after the hold expires requires reconciliation/refund and never publishes an order', async () => {
  let now = baseNow;
  const simulator = createSimulator({ now: () => now, reservationTtlMs: 1_000 });
  simulator.resumeForTests();
  const { quote } = await checkout(simulator, { items: [{ sku: catalog[0].sku, quantity: 1 }] });
  const intent = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'journey-expired-01', scenario: 'delay' });
  now += 1_001;
  const late = await simulator.deliverDelayed(intent.id);
  assert.equal(late.status, 'reconciliation_required');
  assert.equal(late.refundRequired, true);
  assert.deepEqual(simulator.counts(), { intents: 1, events: 1, orders: 0, invoices: 0 });
  assert.equal(simulator.stockFor(catalog[0].sku), 5);
});

test('webhook signature and status are verified before event ingestion', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  const { quote } = await checkout(simulator, { items: [{ sku: catalog[0].sku, quantity: 1 }] });
  const intent = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'webhook-validation-01', scenario: 'delay' });
  const event = { providerKey: intent.providerKey, providerEventId: 'invalid-status-event', intentId: intent.id,
    providerReference: intent.providerReference, amountMinor: intent.amountMinor, currency: intent.currency,
    status: 'pending', createdAt: baseNow };
  const { rawBody, signature } = await signWebhook(event);
  await assert.rejects(simulator.receiveWebhook({ rawBody, signature }), { code: 'WEBHOOK_STATUS_UNSUPPORTED' });
  await assert.rejects(simulator.receiveWebhook({ rawBody, signature: '00' }), { code: 'SIMULATOR_SIGNATURE_INVALID' });
  assert.equal(simulator.counts().events, 0);
  assert.equal(intent.status, 'pending');
});

test('signed amount mismatch enters reconciliation without creating visible orders', async () => {
  const simulator = createSimulator();
  simulator.resumeForTests();
  const { quote } = await checkout(simulator, { items: [{ sku: catalog[0].sku, quantity: 1 }] });
  const intent = await simulator.createPayment({ quoteId: quote.id, idempotencyKey: 'amount-mismatch-01', scenario: 'delay' });
  const event = { providerKey: intent.providerKey, providerEventId: 'signed-wrong-amount', intentId: intent.id,
    providerReference: intent.providerReference, amountMinor: intent.amountMinor - 1, currency: intent.currency,
    status: 'captured', createdAt: baseNow };
  await assert.rejects(simulator.receiveWebhook(await signWebhook(event)), { code: 'PAYMENT_MISMATCH' });
  assert.equal(simulator.intentFor(intent.id).status, 'reconciliation_required');
  assert.equal(simulator.counts().orders, 0);
  assert.equal(simulator.stockFor(catalog[0].sku), 5);
});

