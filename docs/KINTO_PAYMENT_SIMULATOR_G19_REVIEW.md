# KINTO payment simulator G19 — review notes

## Scope

`tests/support/payment-simulator-g19.mjs` is an in-memory, server-side test harness. It accepts only an explicit `isolated` environment, a project ref different from the configured production project ref, a test secret, and a server fixture catalog. It has no Supabase client, HTTP listener, provider SDK, redirect URL, or access to the production checkout/order RPCs. Keeping it under `tests/` prevents it from being deployed with Supabase Edge Functions. Simulator events use HMAC test signatures and the G18 new-payment admission policy.

The harness covers server-side cart quote/revalidation, store-specific coupons, shipping exclusion, 15-minute stock holds, group payment, one KN order and invoice per store, store-scoped order/invoice views, customer payment history, exactly-once stock effects, declined payments, delayed and expired captures, duplicate notifications, idempotent retries, global/provider emergency stops, and manual fallback.

## Environment and migration decision

G19 adds no database state, so it intentionally has no SQL migration. Keeping simulator fixtures, orders, and invoices in memory avoids writing test data into `orders`, invoice tables, inventory, or dashboards in any Supabase project. G18's production-facing runtime migration remains a separate review-only migration; it has not been applied. No migration has been executed against production or an isolated database in this phase.

The configured Supabase project does not support development branches on its current plan, and this workspace has no local PostgreSQL/Docker runtime. As a result, SQL runtime behavior remains unverified against a database. The static migration contract tests only check critical guards and invariants; they are not a substitute for applying migrations in a disposable Supabase project.

## Risks and limits

- This is a deterministic simulator/harness, not yet a user-facing checkout screen or an Edge Function endpoint. The current customer cart still follows its existing checkout RPC. The harness validates the intended payment-before-order journey without redirecting actual customers or creating actual orders.
- In-memory holds and deduplication reset when the process exits. They are suitable for isolated tests only; a real provider integration must use persistent reservations, a durable inbox, and database transactions.
- The harness models the paid order/invoice/dashboard projection to verify expected visibility. It does not call the production order engine or prove its trigger behavior. G18/G19 does not modify the existing workflow after `تم التسديد`.
- Provider webhook HMAC uses a test-only shared secret and must not be reused as a real provider verifier.

## Rollback

G19 is rolled back by removing the simulator module, its test file, and its `test:payments` script entry. There is no G19 database rollback because G19 has no migration. The existing G18 migration has not been applied; if approved for a disposable test project later, rollback should be tested there before any production discussion. No production SQL should be run without the user's separate explicit approval.

## Verification performed

`npm run test:payments` runs the G18 adapter/security tests and G19 simulator journey tests. The suite checks that test mode cannot be constructed for production, and exercises success, refusal, delay, idempotency, duplicate callbacks, expired holds, inventory serialization, invoice visibility, emergency stop, and manual fallback. It is an application-level test suite; it does not claim a live Supabase integration test.
