import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, webcrypto } from 'node:crypto';
import { verifyProtectedPreviewOidc } from '../supabase/functions/kinto-payment-p5/vercel-oidc.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'p5-test-key', alg: 'RS256', use: 'sig' };
const now = 1_900_000_000_000;

function signedToken(overrides = {}) {
  const issued = Math.floor(now / 1000);
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://oidc.vercel.com/kinto1', aud: 'https://vercel.com/kinto1',
    sub: 'owner:kinto1:project:meshwar-system-v2:environment:preview',
    owner: 'kinto1', project: 'meshwar-system-v2', environment: 'preview',
    iat: issued, exp: issued + 3600, ...overrides,
  })).toString('base64url');
  const content = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(content).end().sign(privateKey).toString('base64url');
  return `${content}.${signature}`;
}

const fetchJwks = async () => new Response(JSON.stringify({ keys: [jwk] }), {
  status: 200, headers: { 'content-type': 'application/json' },
});

test('accepts a correctly signed preview token for the exact Vercel project', async () => {
  assert.equal(await verifyProtectedPreviewOidc(signedToken(), { now, fetchImpl: fetchJwks }), true);
});

test('rejects signed tokens for another owner, project, or environment', async () => {
  assert.equal(await verifyProtectedPreviewOidc(signedToken({ owner: 'other' }), { now, fetchImpl: fetchJwks }), false);
  assert.equal(await verifyProtectedPreviewOidc(signedToken({ project: 'production-site' }), { now, fetchImpl: fetchJwks }), false);
  assert.equal(await verifyProtectedPreviewOidc(signedToken({ environment: 'production' }), { now, fetchImpl: fetchJwks }), false);
});

test('rejects expired, tampered, and non-Vercel issuers', async () => {
  assert.equal(await verifyProtectedPreviewOidc(signedToken({ exp: Math.floor(now / 1000) - 1 }), { now, fetchImpl: fetchJwks }), false);
  const valid = signedToken();
  const tokenParts = valid.split('.');
  const signature = Buffer.from(tokenParts[2], 'base64url');
  signature[0] ^= 0x01;
  const tampered = `${tokenParts[0]}.${tokenParts[1]}.${signature.toString('base64url')}`;
  assert.equal(await verifyProtectedPreviewOidc(tampered, { now, fetchImpl: fetchJwks }), false);
  assert.equal(await verifyProtectedPreviewOidc(signedToken({ iss: 'https://attacker.invalid' }), { now, fetchImpl: fetchJwks }), false);
});
