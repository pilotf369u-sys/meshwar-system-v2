/**
 * KINTO's provider boundary. Concrete provider SDK/API calls stay behind this
 * server-only interface. An intent pins providerKey/environment/adapterVersion
 * at creation; changing the active provider affects new intents only.
 */
export const CHECKOUT_PROTOCOLS = Object.freeze(['hosted_checkout', 'api', 'sdk']);

export class PaymentGatewayError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.code = code;
  }
}

export function createPaymentGatewayAdapter({ providerKey, protocol, version, operations }) {
  if (!/^[a-z][a-z0-9_-]{1,47}$/.test(String(providerKey || ''))) {
    throw new PaymentGatewayError('INVALID_PROVIDER_KEY');
  }
  if (!CHECKOUT_PROTOCOLS.includes(protocol)) throw new PaymentGatewayError('UNSUPPORTED_CHECKOUT_PROTOCOL');
  for (const operation of ['createCheckoutSession', 'verifyWebhook', 'getPayment', 'refund']) {
    if (typeof operations?.[operation] !== 'function') throw new PaymentGatewayError('ADAPTER_OPERATION_MISSING', operation);
  }
  return Object.freeze({
    providerKey,
    protocol,
    version: String(version || '1'),
    createCheckoutSession: input => operations.createCheckoutSession(input),
    verifyWebhook: input => operations.verifyWebhook(input),
    getPayment: input => operations.getPayment(input),
    refund: input => operations.refund(input),
  });
}

export function assertNewPaymentAllowed(runtime, providerKey) {
  if (runtime?.payment_mode !== 'electronic' || runtime?.new_payments_paused !== false || runtime?.active_provider_paused !== false || runtime?.gateways_enabled !== true) {
    throw new PaymentGatewayError('NEW_PAYMENTS_PAUSED');
  }
  if (!providerKey || runtime?.active_gateway_provider !== providerKey) {
    throw new PaymentGatewayError('PROVIDER_NOT_ACTIVE');
  }
}

/** Validate the verified provider result against the immutable server snapshot. */
export function validateVerifiedPayment(event, intent) {
  if (!event || event.signatureVerified !== true) throw new PaymentGatewayError('WEBHOOK_SIGNATURE_INVALID');
  if (event.providerKey !== intent.providerKey) throw new PaymentGatewayError('PROVIDER_MISMATCH');
  if (!event.providerEventId || !event.providerReference || !event.intentId) throw new PaymentGatewayError('EVENT_IDENTITY_MISSING');
  if (event.intentId !== intent.id) throw new PaymentGatewayError('INTENT_MISMATCH');
  if (event.amountMinor !== intent.amountMinor || event.currency !== intent.currency) throw new PaymentGatewayError('AMOUNT_OR_CURRENCY_MISMATCH');
  if (intent.providerReference && event.providerReference !== intent.providerReference) throw new PaymentGatewayError('PROVIDER_REFERENCE_MISMATCH');
  if (!['pending', 'captured', 'failed', 'refunded', 'partially_refunded'].includes(event.status)) {
    throw new PaymentGatewayError('UNSUPPORTED_PROVIDER_STATUS');
  }
  return Object.freeze({ ...event, providerKey: intent.providerKey });
}

/** Simulator used by tests only; it has no network endpoint and cannot charge. */
export function createTestSimulatorAdapter() {
  const adapter = createPaymentGatewayAdapter({
    providerKey: 'test-simulator',
    protocol: 'hosted_checkout',
    version: 'test-only-v1',
    operations: {
      async createCheckoutSession({ intent }) {
        return { providerReference: `sim_${intent.id}`, redirectUrl: null, mode: 'no-charge-test' };
      },
      async verifyWebhook({ event }) {
        return { ...event, providerKey: 'test-simulator', signatureVerified: event?.signatureVerified === true };
      },
      async getPayment({ intent }) {
        return { providerKey: 'test-simulator', providerReference: intent.providerReference, status: intent.status };
      },
      async refund({ intent, amountMinor, idempotencyKey }) {
        return { providerReference: intent.providerReference, amountMinor, idempotencyKey, status: 'test_only' };
      },
    },
  });
  return adapter;
}
