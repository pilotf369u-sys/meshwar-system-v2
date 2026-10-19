import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../js/customer-payment-p5.js', import.meta.url), 'utf8');

async function loadWithFetch(fetchImpl) {
  const context = {
    KINTO_PAYMENT_P5_CONFIG: { url: 'https://test.supabase.co', anonKey: 'test-publishable-key' },
    KintoCustomerSessionV150: { read: () => ({ token: 'signed-customer-session-token' }) },
    fetch: fetchImpl,
    Date,
    setTimeout,
    clearTimeout,
    console,
  };
  context.window = context;
  vm.runInNewContext(script, context, { filename: 'customer-payment-p5.js' });
  return context.KintoPaymentP5V1;
}

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('P5 Edge Function outage falls back to the existing session-checked RPC and allows stable manual checkout', async () => {
  const requests = [];
  const api = await loadWithFetch(async (url, options) => {
    requests.push({ url, options });
    if (String(url).includes('/functions/v1/')) return response(404, { error: 'not deployed' });
    return response(200, { effective_mode: 'manual', transition_state: 'stable', checkout_available: false });
  });

  assert.equal(await api.getMode(), 'manual');
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /\/rest\/v1\/rpc\/kinto_payment_p5_mode_read_v1$/);
  assert.equal(JSON.parse(requests[1].options.body).p_session_token, 'signed-customer-session-token');
});

test('the fallback never converts electronic, draining, or unknown server states into manual', async (t) => {
  for (const [name, result, expected] of [
    ['electronic', { effective_mode: 'electronic', transition_state: 'stable', checkout_available: true }, 'electronic'],
    ['draining', { effective_mode: 'manual', transition_state: 'draining', checkout_available: false }, 'blocked'],
    ['unknown', null, 'unknown'],
  ]) {
    await t.test(name, async () => {
      const api = await loadWithFetch(async (url) => String(url).includes('/functions/v1/')
        ? response(503, { error: 'unavailable' })
        : result ? response(200, result) : response(503, { error: 'unavailable' }));
      assert.equal(await api.getMode(), expected);
    });
  }
});

test('an electronic checkout requiring a test grant is reported as unauthorized', async () => {
  const api = await loadWithFetch(async (url) => String(url).includes('/functions/v1/')
    ? response(200, { ok: true, data: { effective_mode: 'electronic', transition_state: 'stable', test_access_required: true } })
    : response(500, {}));

  assert.equal(await api.getMode(), 'unauthorized');
});
