import test from 'node:test';
import assert from 'node:assert/strict';
import { isKintoSimulatorCard, isSimulatorFailureScenario } from '../supabase/functions/_shared/kinto-simulator-card.mjs';

test('only the fixed virtual simulator card is accepted', () => {
  assert.equal(isKintoSimulatorCard({ number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' }), true);
  assert.equal(isKintoSimulatorCard({ number: '4242424242424242', expiry: '12/30', cvv: '123' }), true);
  assert.equal(isKintoSimulatorCard({ number: '4111 1111 1111 1111', expiry: '12/30', cvv: '123' }), false);
  assert.equal(isKintoSimulatorCard({ number: '4242 4242 4242 4242', expiry: '01/31', cvv: '123' }), false);
  assert.equal(isKintoSimulatorCard({ number: '4242 4242 4242 4242', expiry: '12/30', cvv: '321' }), false);
  assert.equal(isKintoSimulatorCard(null), false);
});

test('browser scenarios can request only non-success outcomes', () => {
  for (const scenario of ['failure', 'cancel', 'unknown', 'disconnect']) assert.equal(isSimulatorFailureScenario(scenario), true);
  assert.equal(isSimulatorFailureScenario('success'), false);
  assert.equal(isSimulatorFailureScenario('paid'), false);
});
