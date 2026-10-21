import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/customer-payment-p5.js', import.meta.url), 'utf8');
async function mode(response) {
  const window = { KintoCustomerSessionV150: { read: () => ({ token: 'isolated-test-session-token' }) } };
  const context = {
    window,
    fetch: async () => {
      if (response instanceof Error) throw response;
      return new Response(JSON.stringify(response), { status: response.status ?? 200, headers: { 'content-type': 'application/json' } });
    },
    Response,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    location: { href: '' },
    document: { getElementById: () => null },
  };
  vm.runInNewContext(source, context);
  return window.KintoPaymentP5V1.getMode();
}

test('only a stable, server-admitted electronic mode enables checkout', async () => {
  assert.equal(await mode({ ok: true, data: { effective_mode: 'electronic', transition_state: 'stable', checkout_available: true } }), 'electronic');
  assert.equal(await mode({ ok: true, data: { effective_mode: 'electronic', transition_state: 'stable', checkout_available: false } }), 'blocked');
  assert.equal(await mode({ ok: true, data: { effective_mode: 'manual', transition_state: 'stable', checkout_available: false } }), 'manual');
});

test('a network error cannot fall through to manual checkout', async () => {
  assert.equal(await mode(new Error('offline')), 'unknown');
});

test('missing P5 RPC preserves pre-migration manual checkout compatibility', async () => {
  assert.equal(await mode({ ok: false, status: 404, error: 'FUNCTION_NOT_FOUND' }), 'legacy-manual');
});
