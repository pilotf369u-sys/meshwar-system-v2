# KINTO Payment-P2 — provider administration

## Scope

Payment-P2 adds provider controls inside the existing admin **طرق الدفع** panel. It adds no tab and does not alter checkout, sales, login, orders, order states, stock, campaigns, rewards, invoices or tracking. No G19–G21 files or runtime paths are included.

The G16 admin-session guard (`private.require_admin_session_v147(text)`) and the G16 `kinto_payment_settings_g16` table are existing dependencies from merged PR #996. Payment-P2 stores its provider registry, emergency-stop state and audit trail in separately named P2 tables; it does not rewrite the G16 RPC or the manual-method catalogue.

## Safe state and provider shape

- Effective mode is reported as `manual` in Payment-P2. G16 remains the source for the persisted mode, and its gateway flag remains unchanged.
- The global emergency stop starts enabled. Admins can always set the stop with a reason. A resume request is audited and rejected until a later reviewed migration provides an actually integrated, non-test provider and explicitly authorizes collection.
- `kinto-simulator` is the only seeded provider. It is marked test-only, disabled by default, and has no checkout endpoint or financial side effect in Payment-P2.
- Provider protocol values cover `hosted_checkout`, `api`, `sdk`, and `simulator`. Multiple provider rows can coexist; this migration does not select a company or claim its integration is ready.
- The schema has no credential/secret field. `integration_ready` and `real_collection_allowed` are constrained to `false` for every provider in this phase.
- The service-role-only server gate rejects the emergency stop, manual mode, disabled gateways, unselected/disabled providers, the simulator, and every not-ready provider. A future payment-start transaction must enforce the gate in the same transaction as attempt creation; Payment-P2 itself creates no attempt endpoint.

## SQL and dependencies

Apply only after review, on an isolated KINTO test database, and only after G16 is present:

1. `supabase/migrations/20261019010000_payment_provider_management_p2.sql`
2. `supabase/read-only/20261019_payment_provider_management_p2_postflight.sql`

The migration creates three RLS-enabled tables, revokes direct client-table access, seeds the disabled simulator, adds an admin-session-protected RPC, and grants the admission gate only to `service_role`. It does not touch `orders`, products, coupon/deal tables, stock functions, invoices, auth flows, or any G18–G21 objects.

The earlier payment branch’s G18 migration also contained payment-intent, event, and financial-ledger tables and a payment-admission writer. Those are deliberately not copied into Payment-P2; they exceed this scope and depend on later checkout/finalization work. Only the provider-control requirements are implemented here under P2 object names.

## Verification and rollback

Local tests cover admission-policy decisions, simulator isolation, provider enable/select behavior, the manual-mode invariant, SQL privilege boundaries, and mounting in the current payment panel. Run:

```sh
node --check js/admin-payment-providers-p2.js
node --check js/payment-provider-policy-p2.mjs
node --test tests/payment-provider-p2.test.mjs tests/g16-payment-mode-contract.test.cjs
git diff --check
```

The postflight SQL is read-only. It checks RLS and table privileges, RPC execute privileges, the simulator record, the emergency-stop default, the audit log, and the unchanged G16 mode values. SQL has not been executed or tested against Supabase in this delivery.

Rollback, only after reviewing any future caller of the server gate:

```sh
psql "$KINTO_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/20261019010000_payment_provider_management_p2_ROLLBACK.sql
```

Rollback drops the P2 RPCs and active runtime/provider tables without `CASCADE`; it intentionally retains the RLS-protected audit table so rollback cannot erase administrative history. G16 tables and settings remain untouched. Export or retain the audit archive before any separately approved cleanup.

## Review limitations

The Supabase CLI is not installed in the coding environment, so migration lifecycle commands and a local Supabase/PostgreSQL execution were unavailable. The SQL was reviewed against the merged G16 schema and Supabase security guidance, but still needs isolated-database execution and the admin-session/save smoke test before any production consideration. The repository’s configured frontend Supabase URL is shared in the current deployment; any generated web preview should be treated as code/visual review only until an isolated backend is configured.
