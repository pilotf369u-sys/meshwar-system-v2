import test from 'node:test';
import assert from 'node:assert/strict';
import { processVerifiedGatewayCallbackG21 } from '../supabase/functions/_shared/kinto-payment-confirmation-g21.mjs';

function mockGateway({ event, recorded = { event_id: 7, status: 'captured', finalization_required: true }, finalized = { ok: true } }) {
  const calls = [];
  const request = new Request('https://unit.test/webhook', {
    method: 'POST', headers: { 'x-signature': 'signed' }, body: '{"raw":"payload"}',
  });
  const adapter = { async verifyWebhook(input) {
    calls.push(['verify', new TextDecoder().decode(input.rawBody), input.headers.get('x-signature')]);
    return event;
  } };
  const intent = { id: 'intent-1', provider_key: 'gateway-a', provider_reference: 'ref-1', amount_minor: 15000, currency: 'IQD' };
  const supabase = {
    from(table) {
      calls.push(['from', table]);
      return { select() { return this; }, eq(_field, value) { calls.push(['intent-id', value]); return this; }, async maybeSingle() { return { data: intent, error: null }; } };
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'kinto_payment_record_verified_event_g21') return { data: recorded, error: null };
      if (name === 'kinto_payment_finalize_g21') return { data: finalized, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  return { request, adapter, supabase, calls };
}

const captured = Object.freeze({
  providerKey: 'gateway-a', providerEventId: 'evt-1', providerReference: 'ref-1',
  intentId: 'intent-1', amountMinor: 15000, currency: 'IQD', status: 'captured', signatureVerified: true,
});

test('G21 rejects unverified webhook before reading the intent or writing payment state', async () => {
  const f = mockGateway({ event: { ...captured, signatureVerified: false } });
  await assert.rejects(processVerifiedGatewayCallbackG21(f), { code: 'WEBHOOK_SIGNATURE_INVALID' });
  assert.deepEqual(f.calls, [['verify', '{"raw":"payload"}', 'signed']]);
});

test('G21 refuses the no-charge simulator at the trusted callback boundary', async () => {
  const f = mockGateway({ event: { ...captured, providerKey: 'test-simulator' } });
  await assert.rejects(processVerifiedGatewayCallbackG21(f), { code: 'SIMULATOR_CANNOT_FINALIZE' });
  assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 0);
});

test('G21 records a verified capture and finalizes it exactly through the service RPC', async () => {
  const f = mockGateway({ event: captured, finalized: { ok: true, status: 'processed', orders_created: true } });
  const result = await processVerifiedGatewayCallbackG21(f);
  assert.equal(result.status, 'processed');
  const rpcCalls = f.calls.filter(call => call[0] === 'rpc');
  assert.deepEqual(rpcCalls.map(call => call[1]), ['kinto_payment_record_verified_event_g21', 'kinto_payment_finalize_g21']);
  assert.equal(rpcCalls[0][2].p_signature_verified, true);
  assert.equal(rpcCalls[0][2].p_event_type, 'captured');
  assert.match(rpcCalls[0][2].p_event_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(rpcCalls[1][2].p_event_id, 7);
});

test('G21 resumes finalization after a duplicate callback recorded before a process interruption', async () => {
  const f = mockGateway({ event: captured, recorded: { event_id: 7, duplicate: true, processing_status: 'received' } });
  await processVerifiedGatewayCallbackG21(f);
  assert.deepEqual(f.calls.filter(call => call[0] === 'rpc').map(call => call[1]), [
    'kinto_payment_record_verified_event_g21', 'kinto_payment_finalize_g21',
  ]);
});

test('G21 does not retry events already finalized or marked for reconciliation', async () => {
  for (const state of ['processed', 'reconciliation_required']) {
    const f = mockGateway({ event: captured, recorded: { event_id: 7, duplicate: true, processing_status: state } });
    const result = await processVerifiedGatewayCallbackG21(f);
    assert.equal(result.processing_status, state);
    assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 1);
  }
});

test('G21 does not finalize a failed payment and defers non-final provider states', async () => {
  const failed = mockGateway({ event: { ...captured, status: 'failed' }, recorded: { ok: true, status: 'failed' } });
  const failure = await processVerifiedGatewayCallbackG21(failed);
  assert.equal(failure.status, 'failed');
  assert.deepEqual(failed.calls.filter(call => call[0] === 'rpc').map(call => call[1]), ['kinto_payment_record_verified_event_g21']);

  const pending = mockGateway({ event: { ...captured, status: 'pending' } });
  assert.deepEqual(await processVerifiedGatewayCallbackG21(pending), { ok: true, status: 'deferred', providerStatus: 'pending' });
  assert.equal(pending.calls.filter(call => call[0] === 'rpc').length, 0);
});

test('G21 rejects amount, currency, and provider mismatches before recording a callback', async () => {
  for (const event of [
    { ...captured, amountMinor: 14999 },
    { ...captured, currency: 'USD' },
    { ...captured, providerKey: 'other-gateway' },
    { ...captured, providerReference: 'other-ref' },
  ]) {
    const f = mockGateway({ event });
    await assert.rejects(processVerifiedGatewayCallbackG21(f));
    assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 0);
  }
});
