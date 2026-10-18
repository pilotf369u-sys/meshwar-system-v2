/**
 * P3 test helper: emits simulated provider outcomes in memory only.
 * It does not quote carts, reserve inventory, call a provider, access Supabase,
 * create payment rows, or pass order-state guards. Keep under tests/.
 */
export class PaymentOutcomeSimulatorP3Error extends Error {
  constructor(code) { super(code); this.name = 'PaymentOutcomeSimulatorP3Error'; this.code = code; }
}

const outcomes = Object.freeze({
  success: Object.freeze({ status: 'simulated_success', requiresReconciliation: false }),
  failure: Object.freeze({ status: 'simulated_failure', requiresReconciliation: false }),
  cancelled: Object.freeze({ status: 'simulated_cancelled', requiresReconciliation: false }),
  network_disconnect: Object.freeze({ status: 'unknown', requiresReconciliation: true }),
});

const clone = value => structuredClone(value);

export class PaymentOutcomeSimulatorP3 {
  #attempts = new Map();
  #idempotency = new Map();
  #notifications = new Map();

  constructor({ testOnly = false } = {}) {
    if (testOnly !== true) throw new PaymentOutcomeSimulatorP3Error('TEST_ONLY_REQUIRED');
  }

  start({ idempotencyKey, scenario, amountMinor = 0, currency = 'IQD' }) {
    const key = String(idempotencyKey || '').trim();
    if (!key) throw new PaymentOutcomeSimulatorP3Error('IDEMPOTENCY_KEY_REQUIRED');
    if (!Object.hasOwn(outcomes, scenario)) throw new PaymentOutcomeSimulatorP3Error('SCENARIO_UNSUPPORTED');
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
      throw new PaymentOutcomeSimulatorP3Error('INVALID_SIMULATED_AMOUNT');
    }
    const existing = this.#idempotency.get(key);
    if (existing) return { duplicate: true, attempt: clone(this.#attempts.get(existing)) };

    const outcome = outcomes[scenario];
    const attempt = Object.freeze({
      id: `sim-p3-${this.#attempts.size + 1}`,
      providerKey: 'kinto-simulator-p3',
      idempotencyKey: key,
      scenario,
      status: outcome.status,
      requiresReconciliation: outcome.requiresReconciliation,
      amountMinor,
      currency,
      simulated: true,
      collectionCreated: false,
      orderCreated: false,
      stockChanged: false,
      paidStateAuthorized: false,
    });
    this.#attempts.set(attempt.id, attempt);
    this.#idempotency.set(key, attempt.id);
    return { duplicate: false, attempt: clone(attempt) };
  }

  notify({ attemptId, notificationId }) {
    const attempt = this.#attempts.get(String(attemptId || ''));
    if (!attempt) throw new PaymentOutcomeSimulatorP3Error('SIMULATED_ATTEMPT_NOT_FOUND');
    const id = String(notificationId || '').trim();
    if (!id) throw new PaymentOutcomeSimulatorP3Error('NOTIFICATION_ID_REQUIRED');
    const key = `${attempt.id}:${id}`;
    if (this.#notifications.has(key)) return { duplicate: true, attempt: clone(attempt) };
    this.#notifications.set(key, { attemptId: attempt.id, notificationId: id, simulated: true });
    return { duplicate: false, attempt: clone(attempt) };
  }

  inspect() {
    return {
      attempts: [...this.#attempts.values()].map(clone),
      notifications: [...this.#notifications.values()].map(clone),
      sideEffects: { collection: 0, paymentRecords: 0, orders: 0, invoices: 0, stockChanges: 0, paidStateTransitions: 0 },
    };
  }
}
