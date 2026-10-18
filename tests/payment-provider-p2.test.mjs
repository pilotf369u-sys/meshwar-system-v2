import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PAYMENT_PROVIDER_PROTOCOLS_P2,
  applyProviderControlP2,
  evaluatePaymentAdmissionP2,
} from '../js/payment-provider-policy-p2.mjs';

const simulator = Object.freeze({
  provider_key: 'kinto-simulator',
  checkout_protocol: 'simulator',
  test_only: true,
  enabled: true,
  integration_ready: false,
  real_collection_allowed: false,
});

const otherwiseReady = Object.freeze({
  emergency_stop: false,
  effective_payment_mode: 'electronic',
  gateways_enabled: true,
  selected_provider_key: 'provider-a',
});

test('only simulator, hosted checkout, API and SDK provider protocols are accepted', () => {
  assert.deepEqual(PAYMENT_PROVIDER_PROTOCOLS_P2, ['simulator', 'hosted_checkout', 'api', 'sdk']);
});

test('global emergency stop denies admission even when the provider is enabled and selected', () => {
  assert.deepEqual(
    evaluatePaymentAdmissionP2({ ...otherwiseReady, emergency_stop: true }, { ...simulator, provider_key: 'provider-a', test_only: false, integration_ready: true, real_collection_allowed: true }),
    { allowed: false, code: 'NEW_PAYMENTS_EMERGENCY_STOPPED' },
  );
});

test('manual mode and disabled gateway flag deny collection despite saved provider selection', () => {
  const provider = { ...simulator, provider_key: 'provider-a', test_only: false, integration_ready: true, real_collection_allowed: true };
  assert.equal(evaluatePaymentAdmissionP2({ ...otherwiseReady, effective_payment_mode: 'manual' }, provider).code, 'ELECTRONIC_COLLECTION_DISABLED');
  assert.equal(evaluatePaymentAdmissionP2({ ...otherwiseReady, gateways_enabled: false }, provider).code, 'ELECTRONIC_COLLECTION_DISABLED');
});

test('the simulator can never authorize real collection, even if selected and enabled', () => {
  assert.deepEqual(
    evaluatePaymentAdmissionP2({ ...otherwiseReady, selected_provider_key: 'kinto-simulator' }, simulator),
    { allowed: false, code: 'PROVIDER_NOT_READY' },
  );
});

test('disabled and non-selected providers are rejected', () => {
  const ready = { ...simulator, provider_key: 'provider-a', test_only: false, integration_ready: true, real_collection_allowed: true };
  assert.equal(evaluatePaymentAdmissionP2(otherwiseReady, { ...ready, enabled: false }).code, 'PROVIDER_NOT_READY');
  assert.equal(evaluatePaymentAdmissionP2(otherwiseReady, { ...ready, provider_key: 'provider-b' }).code, 'PROVIDER_NOT_READY');
});

test('admin provider selection/disable operations never switch the effective system from manual', () => {
  const state = { providers: [{ ...simulator, enabled: false }], selected_provider_key: null, emergency_stop: true, effective_payment_mode: 'manual', real_collection_allowed: false };
  const enabled = applyProviderControlP2(state, 'set_provider_enabled', 'kinto-simulator', true);
  const selected = applyProviderControlP2(enabled, 'select_provider', 'kinto-simulator');
  const stopped = applyProviderControlP2(selected, 'emergency_stop');
  assert.equal(enabled.providers[0].enabled, true);
  assert.equal(selected.selected_provider_key, 'kinto-simulator');
  assert.equal(stopped.emergency_stop, true);
  for (const result of [enabled, selected, stopped]) {
    assert.equal(result.effective_payment_mode, 'manual');
    assert.equal(result.real_collection_allowed, false);
  }
  const disabled = applyProviderControlP2(selected, 'set_provider_enabled', 'kinto-simulator', false);
  assert.equal(disabled.selected_provider_key, null);
});

test('P2 SQL exposes only the admin control and a service-role-only fail-closed gate', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261019010000_payment_provider_management_p2.sql', import.meta.url), 'utf8');
  assert.match(sql, /integration_ready boolean not null default false check \(integration_ready is false\)/i);
  assert.match(sql, /real_collection_allowed boolean not null default false check \(real_collection_allowed is false\)/i);
  assert.match(sql, /emergency_stop boolean not null default true/i);
  assert.match(sql, /private\.require_admin_session_v147\(p_session_token\)/i);
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'role'[\s\S]{0,80}'service_role'/i);
  assert.match(sql, /grant execute on function public\.kinto_payment_p2_assert_new_payment_allowed\(text\)\s+to service_role/i);
  assert.match(sql, /grant execute on function public\.kinto_payment_provider_admin_p2[\s\S]*to anon, authenticated/i);
  assert.doesNotMatch(sql, /create\s+table[^;]*payment_intents|insert\s+into\s+public\.orders|update\s+public\.local_products|create\s+trigger/i);
});

test('P2 admin controls mount only inside the existing payment-methods panel', async () => {
  const html = await readFile(new URL('../admin-dashboard.html', import.meta.url), 'utf8');
  const g16 = await readFile(new URL('../js/admin-payment-methods-g16.js', import.meta.url), 'utf8');
  assert.match(html, /data-admin-section="g16PaymentMethods"/);
  assert.doesNotMatch(html, /data-admin-section="paymentProvidersP2"/);
  assert.match(g16, /id='paymentProvidersP2'/);
  assert.match(g16, /container\.insertBefore\(section,form\)/);
  assert.match(g16, /js\/admin-payment-providers-p2\.js/);
  assert.match(g16, /loadPaymentProvidersP2\(\)\.catch/);
});
