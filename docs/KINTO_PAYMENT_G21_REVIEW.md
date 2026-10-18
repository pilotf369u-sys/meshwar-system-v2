# KINTO payment confirmation — G21 review

G21 prepares a provider-neutral, server-only payment confirmation path. It is code and SQL for review on `feature/kinto-electronic-payment`; it has not been applied to any Supabase project. The simulator remains test-only and is not accepted by the callback pipeline.

## What the code path does

- A concrete gateway adapter verifies the raw callback body and returns the normalized G18 event contract. The shared G21 callback helper checks the immutable intent provider, reference, amount, and currency before it calls database RPCs.
- `kinto_payment_record_verified_event_g21` is service-role-only. It records a verified `captured` or `failed` event with provider/event deduplication and leaves emergency pause unrelated to callbacks for already-created payments.
- `kinto_payment_admit_reserved_intent_g21` derives amount/currency from the locked server quote and requires a live reservation before calling the G18 emergency-stop gate. A paused/unconfigured provider releases the temporary stock/coupon hold and returns the manual route. The G19 simulator key is explicitly refused by this production admission path.
- `kinto_payment_finalize_g21` is service-role-only. It accepts a captured event once, checks the reservation and price snapshot, creates per-store orders through `checkout_independent_vendor_orders_v161`, consumes only coupons held by that reservation, and updates those orders to the existing `تم التسديد` state under the existing paid-transition permit. V47 remains the physical stock deduction path.
- If a capture arrives after the hold expires, or price/stock/order processing conflicts, the new order transaction is rolled back and the intent is marked `reconciliation_required`. This code does not issue an automatic refund because no provider has been selected.
- A new order trigger serializes manual and electronic paid transitions on the same `local_products` rows. Manual payments count live G20 holds; electronic finalization excludes only its own permit-backed reservation. It applies to total, configured variant, and `matrix_stock` availability before V47 runs.
- Expired coupon reservation rows are cleaned before an ID is held again. The installed V401 `customer_apply_coupon_v310` selector is patched to skip still-live electronic coupon holds, so unheld old coupons remain eligible to the manual V310/V401 path. On successful intent admission, the quote lifetime is extended to the reservation's 15-minute expiry.

## Limits and activation gates

- There is still no selected/implemented payment company adapter and no deployed webhook endpoint. The shared handler is called by a future provider-specific Edge Function; it cannot verify an arbitrary provider callback by itself.
- G20 review UI continues to show per-store native amounts and keeps mixed-currency carts manual-only. No FX conversion is added.
- The electronic cart path still excludes direct offers; it does not add a coupon to direct offers.
- No live Supabase database has been used. The new isolated PostgreSQL integration executes the G21 migration and rollback against PGlite and loads the active V161, V401 and V93 definitions. It does not apply the entire historical Supabase migration chain or exercise PostgREST/Edge networking.

## Verification

Software tests (`npm run test:payments`) cover signed-callback gating, provider/amount/currency mismatch rejection, event fingerprint shape, retry after callback-processing interruption, failed payments, and pending events. These remain adapter tests and do not prove SQL behavior.

The new `ci/kinto-payment-g21.integration.mjs` executes the exact G21 migration and rollback on isolated PostgreSQL (PGlite locally; PostgreSQL 17 in CI). Its reduced schema is synthetic. It runs the deployed V161 wrapper, the exact V401 coupon RPC, the G20 coupon reservation guard and the V93 bundle stock lifecycle. The V101 implementation is a fixture that models its output/price contract and includes a fail-on-second-store injection; the test does not claim to re-run every historical V97/V101 dependency.

Local SQL results: 10 behavior scenarios pass on PGlite, covering repeat migration installation, real V161 parameter/signature use, V310/V401 customer session rejection, manual payment blocked by an active last-piece reservation, manual V47 stock/variant/matrix deduction once after release, electronic capture with its own hold, held/free/expired/used coupons, late capture reconciliation, second-store creation failure rollback, a later-store matrix failure after coupon use rollback, duplicate capture idempotency, and G21 rollback preserving event/intent audit rows. The V161 function is executed with the correct verified customer id/name/phone, empty shipping object, and server-built product/option/quantity array. V161 itself has no customer session-token argument and retains its pre-existing `anon`/`authenticated` grants for legacy checkout; G21 neither widens those grants nor invokes V161 from the browser. The payment path reaches it only after the OTP-backed G20 quote/reservation and G21 service-role checks match the customer across the verified intent, quote, and reservation. PGlite uses PostgreSQL itself but is not a multi-session server; the native PostgreSQL 17 workflow repeats the scenarios and additionally forces a two-connection last-piece lock race. That native workflow has been added but was not run from this workspace.

The earlier `supabase/tests/kinto_payment_confirmation_g21.sql` remains a lightweight catalog/helper check and is not presented as the SQL integration gate. The original 32 Node tests are not a substitute for either SQL suite.

## Risks and rollback

- The migration has dependencies on G18 payment tables, G20 quote/reservation tables, the G16 paid-transition permit, V161, V310/V401 coupons, and the existing V47/V93 paid-stock trigger. Apply only after those exact migrations are present.
- The migration intentionally fails if the installed coupon function body differs from the reviewed V401 source; inspect that function definition before isolated apply rather than weakening the migration check.
- The stock guard changes one manual behavior: if a live electronic hold claims stock, a manual order cannot transition to paid using that reserved quantity. A behavioral SQL test proves rejection while held and successful manual transition after expiry, with V93 deducting total/variant/matrix stock once. The simultaneous two-session race is reserved for native PostgreSQL 17 CI.
- Roll back only after pausing new electronic payments and reconciling any captured-but-unfinalized intents. Keep payment events, intent ledger, order links, and captured orders for audit. Then disable the G21 stock/expiry triggers and restore the original V401 coupon function from its migration. Do not delete G18/G20 rows or reverse V47 stock changes as part of schema rollback.

## SQL rollback file

`supabase/rollback/20261018220000_kinto_payment_confirmation_g21_ROLLBACK.sql` was executed after the synthetic G21 scenarios. The test proves that it restores the original V401 function body, removes the G21 confirmation function, and retains intent/event records. It remains a review aid and is not approved for production execution.

## Isolated SQL test setup

Install the test-only drivers outside the project dependencies, then run both suites:

```sh
npm install --prefix /tmp/kinto-g21-pg --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8 pg@8.16.3
KINTO_PGLITE_MODULE=/tmp/kinto-g21-pg/node_modules/@electric-sql/pglite/dist/index.js npm run test:payments:sql
```

For native PostgreSQL 17, provide a disposable local database named `kinto_test` and run:

```sh
KINTO_TEST_DATABASE_URL=postgresql://postgres:TEST_ONLY_PASSWORD@127.0.0.1:5432/kinto_test \
KINTO_PG_MODULE=/tmp/kinto-g21-pg/node_modules/pg/lib/index.js npm run test:payments:sql
```

The native test creates a separate `kinto_payment_g21_test` database and synthetic rows; it rejects non-local URLs. In this workspace Docker and PostgreSQL server binaries are unavailable, and package-manager installation was blocked by the sandbox's `_apt` user namespace restrictions. The PGlite suite did run locally. The shortest native alternative is the new GitHub Actions workflow, which provisions an isolated PostgreSQL 17 service and runs both SQL modes; this workflow has not yet reported a CI result.
