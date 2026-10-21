import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentOutcomeSimulatorP3, PaymentOutcomeSimulatorP3Error } from './support/payment-outcome-simulator-p3.mjs';

function simulator() { return new PaymentOutcomeSimulatorP3({ testOnly: true }); }

test('test-only guard rejects construction without explicit test mode', () => {
  assert.throws(() => new PaymentOutcomeSimulatorP3(), { code: 'TEST_ONLY_REQUIRED' });
});

test('success is only a simulated result and creates no collection, payment record, order, invoice or stock effect', () => {
  const engine = simulator();
  const { attempt } = engine.start({ idempotencyKey: 'success-1', scenario: 'success', amountMinor: 2500, currency: 'IQD' });
  assert.equal(attempt.status, 'simulated_success');
  assert.equal(attempt.simulated, true);
  assert.equal(attempt.collectionCreated, false);
  assert.equal(attempt.paidStateAuthorized, false);
  assert.deepEqual(engine.inspect().sideEffects, { collection: 0, paymentRecords: 0, orders: 0, invoices: 0, stockChanges: 0, paidStateTransitions: 0 });
});

test('failure and customer cancellation stay local and leave every business side effect at zero', () => {
  for (const [scenario, expected] of [['failure', 'simulated_failure'], ['cancelled', 'simulated_cancelled']]) {
    const engine = simulator();
    const { attempt } = engine.start({ idempotencyKey: `case-${scenario}`, scenario });
    assert.equal(attempt.status, expected);
    assert.equal(attempt.collectionCreated, false);
    assert.equal(attempt.orderCreated, false);
    assert.deepEqual(engine.inspect().sideEffects, { collection: 0, paymentRecords: 0, orders: 0, invoices: 0, stockChanges: 0, paidStateTransitions: 0 });
  }
});

test('network disconnect remains unknown and marks reconciliation required without treating it as success or failure', () => {
  const engine = simulator();
  const { attempt } = engine.start({ idempotencyKey: 'disconnect-1', scenario: 'network_disconnect' });
  assert.equal(attempt.status, 'unknown');
  assert.equal(attempt.requiresReconciliation, true);
  assert.notEqual(attempt.status, 'simulated_success');
  assert.notEqual(attempt.status, 'simulated_failure');
  assert.equal(attempt.paidStateAuthorized, false);
  assert.deepEqual(engine.inspect().sideEffects, { collection: 0, paymentRecords: 0, orders: 0, invoices: 0, stockChanges: 0, paidStateTransitions: 0 });
});

test('same idempotency key returns one stable result and never creates a second simulated attempt', () => {
  const engine = simulator();
  const first = engine.start({ idempotencyKey: 'retry-1', scenario: 'success' });
  const retry = engine.start({ idempotencyKey: 'retry-1', scenario: 'failure' });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.attempt.id, first.attempt.id);
  assert.equal(retry.attempt.status, 'simulated_success');
  assert.equal(engine.inspect().attempts.length, 1);
});

test('repeated simulated notification with the same event key is idempotent', () => {
  const engine = simulator();
  const { attempt } = engine.start({ idempotencyKey: 'notify-1', scenario: 'success' });
  assert.equal(engine.notify({ attemptId: attempt.id, notificationId: 'event-1' }).duplicate, false);
  assert.equal(engine.notify({ attemptId: attempt.id, notificationId: 'event-1' }).duplicate, true);
  assert.equal(engine.inspect().notifications.length, 1);
  assert.equal(engine.inspect().sideEffects.paidStateTransitions, 0);
});

test('invalid outcomes, missing keys and malformed amounts fail before storing any attempt', () => {
  const engine = simulator();
  assert.throws(() => engine.start({ idempotencyKey: 'bad-scenario', scenario: 'capture' }), { code: 'SCENARIO_UNSUPPORTED' });
  assert.throws(() => engine.start({ scenario: 'success' }), { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  assert.throws(() => engine.start({ idempotencyKey: 'bad-amount', scenario: 'success', amountMinor: -1 }), { code: 'INVALID_SIMULATED_AMOUNT' });
  assert.throws(() => engine.notify({ attemptId: 'missing', notificationId: 'event' }), { code: 'SIMULATED_ATTEMPT_NOT_FOUND' });
  assert.ok(engine instanceof PaymentOutcomeSimulatorP3);
  assert.ok(PaymentOutcomeSimulatorP3Error.prototype instanceof Error);
  assert.equal(engine.inspect().attempts.length, 0);
});
