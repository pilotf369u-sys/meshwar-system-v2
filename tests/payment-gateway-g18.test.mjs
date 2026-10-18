import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertNewPaymentAllowed,
  createPaymentGatewayAdapter,
  createTestSimulatorAdapter,
  validateVerifiedPayment,
} from '../supabase/functions/_shared/kinto-payment-gateway-g18.mjs';

const intent = Object.freeze({
  id: '2f5d14c2-d0ce-4ad7-a0a5-5cfe84727c2d',
  customerId: 'customer-7',
  providerKey: 'provider-a',
  providerEnvironment: 'sandbox',
  providerAdapterVersion: 'v3',
  providerReference: 'charge-a-123',
  amountMinor: 15900,
  currency: 'IQD',
  status: 'pending',
});

function event(overrides = {}) {
  return {
    providerKey: 'provider-a', providerEventId: 'evt-1', providerReference: 'charge-a-123',
    intentId: intent.id, amountMinor: 15900, currency: 'IQD', status: 'captured', signatureVerified: true,
    ...overrides,
  };
}

test('server admission policy blocks new attempts when paused or switched to manual', () => {
  assert.throws(() => assertNewPaymentAllowed({ payment_mode: 'manual', new_payments_paused: false, gateways_enabled: true, active_gateway_provider: 'provider-a' }, 'provider-a'), { code: 'NEW_PAYMENTS_PAUSED' });
  assert.throws(() => assertNewPaymentAllowed({ payment_mode: 'electronic', new_payments_paused: true, gateways_enabled: true, active_gateway_provider: 'provider-a' }, 'provider-a'), { code: 'NEW_PAYMENTS_PAUSED' });
  assert.throws(() => assertNewPaymentAllowed({ payment_mode: 'electronic', new_payments_paused: false, active_provider_paused: true, gateways_enabled: true, active_gateway_provider: 'provider-a' }, 'provider-a'), { code: 'NEW_PAYMENTS_PAUSED' });
  assert.throws(() => assertNewPaymentAllowed({ payment_mode: 'electronic', new_payments_paused: false, active_provider_paused: false, gateways_enabled: true, active_gateway_provider: 'provider-b' }, 'provider-a'), { code: 'PROVIDER_NOT_ACTIVE' });
  assert.doesNotThrow(() => assertNewPaymentAllowed({ payment_mode: 'electronic', new_payments_paused: false, active_provider_paused: false, gateways_enabled: true, active_gateway_provider: 'provider-a' }, 'provider-a'));
});

test('existing intent remains pinned to its original provider after active provider changes', () => {
  const afterSwitch = { active_gateway_provider: 'provider-b' };
  assert.equal(afterSwitch.active_gateway_provider, 'provider-b');
  assert.equal(intent.providerKey, 'provider-a');
  assert.equal(intent.providerReference, 'charge-a-123');
  assert.throws(() => validateVerifiedPayment(event({ providerKey: 'provider-b' }), intent), { code: 'PROVIDER_MISMATCH' });
  assert.equal(validateVerifiedPayment(event(), intent).providerKey, 'provider-a');
});

test('adapter contract supports hosted checkout, API and server-side SDK integrations', async () => {
  for (const protocol of ['hosted_checkout', 'api', 'sdk']) {
    const adapter = createPaymentGatewayAdapter({
      providerKey: `provider-${protocol}`, protocol, version: '1.0.0',
      operations: Object.fromEntries(['createCheckoutSession', 'verifyWebhook', 'getPayment', 'refund'].map(k => [k, async () => ({ ok: true })])),
    });
    assert.equal(adapter.protocol, protocol);
    assert.deepEqual(await adapter.getPayment({}), { ok: true });
  }
  assert.throws(() => createPaymentGatewayAdapter({ providerKey: 'x', protocol: 'browser-widget', version: '1', operations: {} }), { code: 'INVALID_PROVIDER_KEY' });
});

test('only server-verified events with exact provider, intent, amount and currency pass', () => {
  assert.equal(validateVerifiedPayment(event(), intent).status, 'captured');
  for (const bad of [
    event({ signatureVerified: false }), event({ providerReference: 'other-ref' }), event({ intentId: 'other-intent' }),
    event({ amountMinor: 15899 }), event({ currency: 'USD' }), event({ providerEventId: '' }),
  ]) assert.throws(() => validateVerifiedPayment(bad, intent));
});

test('simulator is explicitly no-charge and returns no redirect suitable for a real checkout', async () => {
  const simulator = createTestSimulatorAdapter();
  const result = await simulator.createCheckoutSession({ intent });
  assert.equal(result.mode, 'no-charge-test');
  assert.equal(result.redirectUrl, null);
  assert.equal((await simulator.refund({ intent, amountMinor: 15900, idempotencyKey: 'refund-test-0001' })).status, 'test_only');
});

test('migration serializes emergency stop against admission and leaves order/post-paid triggers untouched', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261018170950_kinto_payment_runtime_g18.sql', import.meta.url), 'utf8');
  assert.match(sql, /new_payments_paused boolean not null default true/i);
  assert.match(sql, /select \* into v_settings[\s\S]*?for update/i);
  assert.match(sql, /new_payments_paused is true/i);
  assert.match(sql, /pause_provider/);
  assert.match(sql, /active_provider_paused/);
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(sql, /unique \(customer_id,idempotency_key\)/i);
  assert.match(sql, /unique\(provider_key,provider_event_id\)/i);
  assert.match(sql, /PAYMENT_INTENT_IDENTITY_IMMUTABLE/);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.kinto_bundle_stock_link_v47/i);
  assert.doesNotMatch(sql, /drop\s+trigger\s+.*orders/i);
});
