import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { test } from 'node:test';
import { createExpiryHandler } from '../supabase/functions/kinto-payment-expiry/handler.mjs';

const secret = 'a'.repeat(64);
const request = token => new Request('http://local/expiry', {
  method: 'POST',
  headers: token ? { 'x-kinto-expiry-secret': token } : {},
});

test('only the dedicated credential can invoke expiry', async () => {
  let calls = 0;
  const handle = createExpiryHandler({
    secret, compare: timingSafeEqual, expire: async () => ++calls, report: () => {},
  });
  assert.equal((await handle(request())).status, 401);
  assert.equal((await handle(request('b'.repeat(64)))).status, 401);
  assert.equal((await handle(request('a'))).status, 401);
  assert.equal((await handle(new Request('http://local/expiry'))).status, 405);
  assert.equal(calls, 0);

  const response = await handle(request(secret));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { expired_unstarted: 1 });
  assert.equal(calls, 1);
});

test('missing configuration, RPC failure and invalid results fail closed', async () => {
  const logs = [];
  const dependencies = {
    compare: timingSafeEqual,
    expire: async () => { throw new Error('private upstream details'); },
    report: code => logs.push(code),
  };
  assert.equal((await createExpiryHandler(dependencies)(request(secret))).status, 503);
  const response = await createExpiryHandler({ ...dependencies, secret })(request(secret));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'EXPIRY_RPC_FAILED' });
  assert.deepEqual(logs, ['KINTO_PAYMENT_EXPIRY_RPC_FAILED']);
  assert.equal((await createExpiryHandler({ ...dependencies, secret, expire: async () => null })(request(secret))).status, 503);
});
