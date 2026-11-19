import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { paymentDatabaseFetch, selectPaymentDatabaseKey } from '../supabase/functions/kinto-payment-p5/database-auth.mjs';
import { isKintoSimulatorCard, isSimulatorFailureScenario } from '../supabase/functions/_shared/kinto-simulator-card.mjs';

const opaque = 'sb_secret_synthetic_for_tests';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const legacy = `${encode({ alg: 'HS256' })}.${encode({ role: 'service_role' })}.synthetic_signature`;
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const validSession = 'synthetic_customer_session_valid';
const invalidSession = 'synthetic_customer_session_invalid';
const source = readFileSync(new URL('../supabase/functions/kinto-payment-p5/index.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source.replace(/^import .+;$/gm, ''));

function fixture({ override, admitted = true, upstreamError } = {}) {
  const calls = [];
  const logs = [];
  let handler;
  const environment = {
    SUPABASE_URL: 'https://p5-fixture.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: opaque,
    KINTO_P5_DATABASE_LEGACY_JWT: override,
  };
  const Deno = { env: { get: name => environment[name] }, serve: callback => { handler = callback; } };
  // Model the two headers inserted by supabase-js 2.57, then run the actual
  // fetch adapter, function routing and response handlers.
  const createClient = (_url, apiKey, options) => ({
    async rpc(name, args) {
      const headers = await options.global.fetch('https://p5-fixture.supabase.co/rest/v1/rpc/' + name, {
        headers: { apikey: apiKey, Authorization: 'Bearer ' + apiKey, ...options.global.headers },
      });
      calls.push({ name, args, headers: new Headers(headers) });
      if (name === 'kinto_payment_p6_customer_admit_v1') {
        if (upstreamError) return { error: upstreamError };
        if (args.p_session_token !== validSession) {
          return { error: { code: 'P0001', message: 'REVIEW_SESSION_INVALID' } };
        }
        return { data: admitted };
      }
      return { data: { fixture: true } };
    },
  });
  new Function('Deno', 'createClient', 'selectPaymentDatabaseKey', 'paymentDatabaseFetch',
    'isKintoSimulatorCard', 'isSimulatorFailureScenario', 'console', body)(
    Deno, createClient, selectPaymentDatabaseKey,
    key => paymentDatabaseFetch(key, async (_input, init) => init.headers),
    isKintoSimulatorCard, isSimulatorFailureScenario, { error: (...args) => logs.push(args) },
  );

  const request = (action, args = {}, session = validSession) => handler(new Request('https://fixture/p5', {
    method: 'POST', body: JSON.stringify({ action, session_token: session, ...args }),
  }));
  return { calls, logs, request };
}

test('credential transport puts opaque credentials only in apikey and preserves legacy Bearer', async () => {
  for (const key of [opaque, legacy]) {
    const send = async (_input, init) => new Headers(init.headers);
    const headers = await paymentDatabaseFetch(key, send)('https://fixture', {
      headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    });
    assert.equal(headers.get('apikey'), key);
    assert.equal(headers.get('authorization'), key === opaque ? null : 'Bearer ' + key);
    assert.equal(headers.get('content-type'), 'application/json');
  }
});

test('database configuration uses only an explicit valid service-role legacy override', async () => {
  assert.equal(selectPaymentDatabaseKey(opaque, undefined), opaque);
  assert.equal(selectPaymentDatabaseKey(opaque, legacy), legacy);
  for (const override of ['', opaque, 'broken.jwt.value', `${encode({ alg: 'HS256' })}.${encode({ role: 'anon' })}.signature`]) {
    const app = fixture({ override });
    assert.equal((await app.request('quote', { items: [{}] })).status, 503);
    assert.equal(app.calls.length, 0);
  }
});

test('cart and campaign actions still use session-scoped P6 admission and existing RPCs', async () => {
  for (const override of [undefined, legacy]) {
    const app = fixture({ override });
    const actions = [
      ['quote', { items: [{}] }, 'kinto_payment_p5_quote_v1'],
      ['reserve', { idempotency_key: id, items: [{}] }, 'kinto_payment_p5_reserve_v1'],
      ['campaign_reserve', { idempotency_key: id, campaign_id: id, items: [{}] }, 'kinto_payment_p5_campaign_reserve_v1'],
      ['start', { attempt_id: id }, 'kinto_payment_p5_start_v1'],
      ['pay', { attempt_id: id, card: { number: '4242424242424242', expiry: '12/30', cvv: '123' } }, 'kinto_payment_p5_simulate_dispatch_v1'],
    ];
    for (const [action, args, expected] of actions) {
      const before = app.calls.length;
      assert.equal((await app.request(action, args)).status, 200);
      const calls = app.calls.slice(before);
      assert.deepEqual(calls.map(call => call.name), ['kinto_payment_p6_customer_admit_v1', expected]);
      for (const call of calls) {
        assert.equal(call.args.p_session_token, validSession);
        assert.equal(call.headers.get('apikey'), override ?? opaque);
        assert.equal(call.headers.get('authorization'), override ? 'Bearer ' + override : null);
      }
      if (action === 'pay') assert.equal(calls[1].args.p_scenario, 'success');
    }
  }
});

test('invalid sessions, closed admission and PostgREST rejection never reach payment RPCs', async () => {
  const app = fixture();
  assert.equal((await app.request('pay', { attempt_id: id }, 'short')).status, 401);
  assert.equal(app.calls.length, 0);
  assert.equal((await app.request('pay', { attempt_id: id }, invalidSession)).status, 401);
  assert.equal(app.calls.length, 1);

  const closed = fixture({ admitted: false });
  assert.equal((await closed.request('campaign_reserve')).status, 409);
  assert.deepEqual(closed.calls.map(call => call.name), ['kinto_payment_p6_customer_admit_v1']);

  const upstream = fixture({ upstreamError: { code: 'PGRST303', message: 'JWT issued at future ' + opaque } });
  const response = await upstream.request('pay', { attempt_id: id });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'PAYMENT_P6_ADMISSION_UNAVAILABLE');
  assert.equal(upstream.calls.length, 1);
  assert.equal(JSON.stringify(upstream.logs).includes(opaque), false);
});

test('client scenarios cannot force success, and a non-test card yields failure', async () => {
  const app = fixture({ override: legacy });
  assert.equal((await app.request('simulate', { attempt_id: id, scenario: 'success' })).status, 400);
  assert.equal(app.calls.length, 1);
  assert.equal((await app.request('pay', { attempt_id: id, card: { number: '123' } })).status, 200);
  assert.equal(app.calls.at(-1).args.p_scenario, 'failure');
});
