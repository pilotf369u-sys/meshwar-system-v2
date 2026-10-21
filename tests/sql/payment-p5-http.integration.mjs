import assert from 'node:assert/strict';

const projectId = 'udtegahgxgqvflodjkjt';
const endpoint = `https://${projectId}.supabase.co/functions/v1/kinto-payment-p5`;
const apikey = 'sb_publishable_KOdceuz9V-tRoIoxD3FjUA_4FoXbBNT';
const customerA = process.env.P5_TEST_SESSION_A;
const customerB = process.env.P5_TEST_SESSION_B;
const expired = process.env.P5_TEST_SESSION_EXPIRED;
for (const [name, value] of Object.entries({ customerA, customerB, expired })) {
  if (!value || value.length < 24) throw new Error(`${name} must be a temporary test-project session token`);
}

async function request(action, sessionToken, fields = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey, authorization: `Bearer ${apikey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action, session_token: sessionToken, ...fields }),
  });
  return { status: response.status, body: await response.json() };
}
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const items = [{
  store_id: '22222222-2222-4222-8222-222222222221',
  product_id: '33333333-3333-4333-8333-333333333333',
  quantity: 1,
  selected_options: {},
}];

// Guest, expired and forged identities must be rejected by the actual HTTP edge.
assert.equal((await request('mode', '')).status, 401, 'guest');
assert.equal((await request('mode', expired)).body.code, 'P0001', 'expired session');
assert.equal((await request('mode', 'forged-session-token-000000000000000000')).body.code, 'P0001', 'forged session');

// A caller-supplied amount, user id, or currency is ignored; quote is rebuilt server-side.
const quote = await request('quote', customerA, {
  items,
  coupon_points: {},
  amount: 0.01,
  currency: 'USD',
  customer_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
});
assert.equal(quote.status, 200, 'server quote');
assert.ok(quote.body.data.amount > 0, 'server calculated amount');
assert.equal(quote.body.data.currency, 'IQD', 'server currency');
assert.equal(quote.body.data.customer_id, null, 'identity is not returned from caller input');

// Race independent HTTP requests against the only stock unit. Exactly one reservation can win.
const payload = (session, key) => ({ action: 'reserve', session_token: session, idempotency_key: uuid(key), items, coupon_points: {}, amount: 0.01, currency: 'USD', customer_id: 'attacker' });
const [raceA, raceB] = await Promise.all([
  fetch(endpoint, { method: 'POST', headers: { apikey, authorization: `Bearer ${apikey}`, 'content-type': 'application/json' }, body: JSON.stringify(payload(customerA, 101)) }),
  fetch(endpoint, { method: 'POST', headers: { apikey, authorization: `Bearer ${apikey}`, 'content-type': 'application/json' }, body: JSON.stringify(payload(customerB, 102)) }),
]);
const [a, b] = await Promise.all([raceA.json(), raceB.json()]);
const winners = [a, b].filter((x) => x.ok);
assert.equal(winners.length, 1, `one last-piece winner only: ${JSON.stringify([a, b])}`);
const winner = winners[0].data;
const winnerSession = a.ok ? customerA : customerB;
const loserSession = a.ok ? customerB : customerA;

// Idempotency is stable, and one customer cannot read the other's attempt.
const sameKey = a.ok ? 101 : 102;
const replay = await request('reserve', winnerSession, { idempotency_key: uuid(sameKey), items, coupon_points: {} });
assert.equal(replay.status, 200);
assert.equal(replay.body.data.attempt_id, winner.attempt_id);
assert.equal(replay.body.data.reused, true);
assert.equal((await request('status', loserSession, { attempt_id: winner.attempt_id })).status, 404, 'other customer cannot read attempt');

// The isolated simulator validates its finite scenarios; it does not accept a provider success token.
assert.equal((await request('simulate', winnerSession, { attempt_id: winner.attempt_id, scenario: 'paid' })).status, 400);
assert.equal((await request('start', winnerSession, { attempt_id: winner.attempt_id })).status, 200);
const cancelled = await request('simulate', winnerSession, { attempt_id: winner.attempt_id, scenario: 'cancel' });
assert.equal(cancelled.body.data.status, 'cancelled');
assert.equal(cancelled.body.data.real_collection_allowed, false);

const after = await request('status', winnerSession, { attempt_id: winner.attempt_id });
assert.equal(after.body.status, undefined); // status wrapper always carries authenticated data under `data`
assert.equal(after.body.data.status, 'cancelled');
console.log(JSON.stringify({
  projectId,
  passed: ['guest rejected', 'expired rejected', 'forged rejected', 'tampered quote inputs ignored', 'two HTTP requests raced for last unit; one won', 'idempotency replay returned the same attempt', 'cross-customer attempt read denied', 'invalid simulated result rejected', 'cancel released the hold without real collection'],
  winner_attempt_id: winner.attempt_id,
  cancelled_status: after.body.data.status,
  real_collection_allowed: cancelled.body.data.real_collection_allowed,
}));
