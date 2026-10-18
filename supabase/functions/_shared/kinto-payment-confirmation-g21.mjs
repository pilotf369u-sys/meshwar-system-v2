import { validateVerifiedPayment, PaymentGatewayError } from './kinto-payment-gateway-g18.mjs';

const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

async function fingerprint(event) {
  const bytes = new TextEncoder().encode(stable({
    providerKey: event.providerKey,
    providerEventId: event.providerEventId,
    providerReference: event.providerReference,
    intentId: event.intentId,
    amountMinor: event.amountMinor,
    currency: event.currency,
    status: event.status,
  }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Provider-neutral callback pipeline. A concrete provider endpoint must pass its
 * adapter and a service-role Supabase client. The simulator is intentionally not
 * an adapter for this function.
 */
export async function processVerifiedGatewayCallbackG21({ request, adapter, supabase }) {
  if (!request || !adapter || !supabase) throw new PaymentGatewayError('CALLBACK_CONFIGURATION_INVALID');
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const verified = await adapter.verifyWebhook({ rawBody, headers: request.headers, url: request.url });
  if (verified?.signatureVerified !== true) throw new PaymentGatewayError('WEBHOOK_SIGNATURE_INVALID');
  if (verified?.providerKey === 'test-simulator') throw new PaymentGatewayError('SIMULATOR_CANNOT_FINALIZE');
  if (!verified?.intentId) throw new PaymentGatewayError('INTENT_ID_MISSING');

  const { data: intent, error: intentError } = await supabase
    .from('kinto_payment_intents_g18')
    .select('*')
    .eq('id', verified.intentId)
    .maybeSingle();
  if (intentError || !intent) throw new PaymentGatewayError('INTENT_NOT_FOUND');
  const event = validateVerifiedPayment(verified, {
    id: intent.id,
    providerKey: intent.provider_key,
    providerReference: intent.provider_reference,
    amountMinor: Number(intent.amount_minor),
    currency: intent.currency,
  });
  if (!['captured', 'failed'].includes(event.status)) {
    return { ok: true, status: 'deferred', providerStatus: event.status };
  }

  const { data: recorded, error: recordError } = await supabase.rpc('kinto_payment_record_verified_event_g21', {
    p_intent_id: intent.id,
    p_provider_key: event.providerKey,
    p_provider_event_id: event.providerEventId,
    p_event_type: event.status,
    p_event_fingerprint: await fingerprint(event),
    p_signature_verified: true,
    p_provider_reference: event.providerReference,
    p_amount_minor: event.amountMinor,
    p_currency: event.currency,
  });
  if (recordError) throw new PaymentGatewayError('PAYMENT_EVENT_RECORD_FAILED', recordError.message);
  if (event.status === 'failed') return recorded;
  const shouldFinalize = recorded?.finalization_required === true
    || (recorded?.duplicate === true && recorded?.processing_status === 'received');
  if (!shouldFinalize) {
    return recorded;
  }

  // A duplicate callback can resume a capture recorded before a process crash.
  const { data: finalized, error: finalizeError } = await supabase.rpc('kinto_payment_finalize_g21', {
    p_event_id: recorded.event_id,
  });
  if (finalizeError) throw new PaymentGatewayError('PAYMENT_FINALIZE_FAILED', finalizeError.message);
  return finalized;
}
