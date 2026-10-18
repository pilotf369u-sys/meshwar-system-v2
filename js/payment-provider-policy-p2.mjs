export const PAYMENT_PROVIDER_PROTOCOLS_P2 = Object.freeze([
  'simulator', 'hosted_checkout', 'api', 'sdk',
]);

/** Pure policy used by the backend contract tests. The P2 migration hard-locks
 * real_collection_allowed and integration_ready to false for every provider. */
export function evaluatePaymentAdmissionP2(runtime, provider) {
  if (runtime?.emergency_stop !== false) return { allowed: false, code: 'NEW_PAYMENTS_EMERGENCY_STOPPED' };
  if (runtime?.effective_payment_mode !== 'electronic' || runtime?.gateways_enabled !== true) {
    return { allowed: false, code: 'ELECTRONIC_COLLECTION_DISABLED' };
  }
  if (!provider || provider.provider_key !== runtime?.selected_provider_key || provider.enabled !== true) {
    return { allowed: false, code: 'PROVIDER_NOT_READY' };
  }
  if (provider.test_only === true || provider.integration_ready !== true || provider.real_collection_allowed !== true) {
    return { allowed: false, code: 'PROVIDER_NOT_READY' };
  }
  return { allowed: true, code: 'ALLOWED' };
}

/** Provider selection and enablement are configuration only in Payment-P2. */
export function applyProviderControlP2(state, action, providerKey, enabled) {
  const providers = (state?.providers || []).map(provider => ({ ...provider }));
  const provider = providers.find(item => item.provider_key === providerKey);
  if (action === 'set_provider_enabled') {
    if (!provider || typeof enabled !== 'boolean') return { ...state, providers, error: 'PROVIDER_NOT_FOUND' };
    provider.enabled = enabled;
    return {
      ...state,
      providers,
      selected_provider_key: enabled ? state.selected_provider_key :
        (state.selected_provider_key === providerKey ? null : state.selected_provider_key),
      effective_payment_mode: 'manual',
      real_collection_allowed: false,
    };
  }
  if (action === 'select_provider') {
    if (!provider?.enabled) return { ...state, providers, error: 'PROVIDER_NOT_ENABLED' };
    return {
      ...state,
      providers,
      selected_provider_key: providerKey,
      effective_payment_mode: 'manual',
      real_collection_allowed: false,
    };
  }
  if (action === 'emergency_stop') {
    return { ...state, providers, emergency_stop: true, effective_payment_mode: 'manual', real_collection_allowed: false };
  }
  return { ...state, providers, error: 'INVALID_ACTION' };
}
