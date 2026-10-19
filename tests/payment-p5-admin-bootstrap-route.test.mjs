import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/p5-test-admin-bootstrap.js';

const previewHost = 'meshwar-system-v2-git-feature-kinto-payment-p5-kinto1.vercel.app';

function response() {
  return {
    headers: {}, statusCode: 0, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = value || ''; },
  };
}

async function invoke({ method = 'POST', host = previewHost, origin = `https://${previewHost}`, oidc = '', body = { action: 'bootstrap_test_admin_and_customer' } } = {}) {
  const res = response();
  await handler({ method, headers: { host, origin, 'x-vercel-oidc-token': oidc }, body }, res);
  return { ...res, json: JSON.parse(res.body || '{}') };
}

test('bootstrap proxy only accepts POST requests', async () => {
  const result = await invoke({ method: 'GET' });
  assert.equal(result.statusCode, 405);
  assert.equal(result.json.error, 'METHOD_NOT_ALLOWED');
});

test('rejects production, public, and cross-origin hosts', async () => {
  const savedEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const wrongHost = await invoke({ host: 'meshwar-system-v2.vercel.app', origin: 'https://meshwar-system-v2.vercel.app' });
    const wrongOrigin = await invoke({ origin: 'https://attacker.example' });
    assert.equal(wrongHost.statusCode, 404);
    assert.equal(wrongOrigin.statusCode, 404);
  } finally {
    if (savedEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedEnv;
  }
});

test('requires a Vercel OIDC token and allows only the bootstrap action', async () => {
  const savedEnv = process.env.VERCEL_ENV;
  const savedFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  globalThis.fetch = async () => { throw new Error('upstream must not be called in a negative test'); };
  try {
    const missingIdentity = await invoke();
    const wrongAction = await invoke({ oidc: 'x'.repeat(200), body: { action: 'anything_else' } });
    assert.equal(missingIdentity.statusCode, 503);
    assert.equal(missingIdentity.json.error, 'PREVIEW_IDENTITY_NOT_CONFIGURED');
    assert.equal(wrongAction.statusCode, 400);
    assert.equal(wrongAction.json.error, 'ACTION_NOT_AVAILABLE');
  } finally {
    globalThis.fetch = savedFetch;
    if (savedEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedEnv;
  }
});
