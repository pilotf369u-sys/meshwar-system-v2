# KINTO payment foundation G18

This branch adds the server-side payment-control and provider boundary foundation. It does not activate a real gateway or change checkout/order behavior.

## Server controls

- `kinto_payment_runtime_admin_g18` protects emergency pause, per-provider pause, provider selection, and the separate resume actions with the existing admin-session verifier. Pause reasons and actor/time are audited.
- `kinto_payment_admit_intent_g18` is service-role-only. It locks the same singleton settings row as the emergency stop before admitting a new intent. A pause committed first therefore blocks later admission. Existing intent records and provider callbacks are not paused by this gate.
- Manual mode blocks admission. Returning to manual does not mutate existing intents, provider references, orders, or paid-order processing.
- Both global and provider-level pauses default to on. Resuming new payments remains unavailable until an enabled sandbox adapter is explicitly configured. Live mode is not enabled by this work.

## Provider boundary

`supabase/functions/_shared/kinto-payment-gateway-g18.mjs` defines the common checkout, webhook verification, payment lookup, and refund contract for hosted checkout, API, or server-side SDK adapters. Every intent stores its original provider, environment, adapter version, provider reference, amount, and currency. Database constraints prevent provider/amount identity changes after creation and deduplicate idempotency keys and provider event IDs.

The simulator exists only in the Node test suite. It has no charge endpoint and returns no redirect URL. No payment company has been selected and no company documentation or credentials were supplied, so no company adapter is registered or live collection allowed.

## Verification

Run `npm run test:payments` for adapter, kill-switch policy, provider pinning, payment matching, and migration-guard tests. These tests do not execute PostgreSQL migrations.

The configured Supabase project does not support development branches on its current plan, and no local Docker/Podman/PostgreSQL runtime is installed in this workspace. The migration has therefore not been applied or tested against any database. Do not apply it to production. Apply and exercise it only after an isolated Supabase project/branch is available.

## Safe fallback

Keep `payment_mode='manual'` and the default pause enabled until the isolated migration and payment tests pass and a provider is selected and reviewed. If any test or reconciliation fails, pause new payments globally and handle already-created intents using their pinned provider; do not delete financial records or modify the post-paid order workflow.
