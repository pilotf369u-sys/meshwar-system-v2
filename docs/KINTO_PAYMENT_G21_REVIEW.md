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
- No SQL has been executed. Do not deploy G21 until the complete migration chain has been applied and tested against an isolated Supabase database, including live concurrency tests for last-unit/manual-vs-electronic stock and coupon expiry.

## Verification

Software tests (`npm run test:payments`) cover signed-callback gating, provider/amount/currency mismatch rejection, event fingerprint shape, retry after callback-processing interruption, failed payments, and pending events. These tests use mocked adapter/database clients; they do not prove PostgreSQL trigger behavior.

Database tests (`supabase/tests/kinto_payment_confirmation_g21.sql`) verify the SQL stock boundary, active trigger presence, service-role execution restrictions, and the installed coupon selector. They require a migrated isolated Supabase database. They have not been run in this workspace because Supabase CLI's local database needs Docker, neither `supabase` nor `docker` is installed, and the only known remote project is production. No attempt was made to connect to or mutate production.

## Risks and rollback

- The migration has dependencies on G18 payment tables, G20 quote/reservation tables, the G16 paid-transition permit, V161, V310/V401 coupons, and the existing V47/V93 paid-stock trigger. Apply only after those exact migrations are present.
- The migration intentionally fails if the installed coupon function body differs from the reviewed V401 source; inspect that function definition before isolated apply rather than weakening the migration check.
- The stock guard changes one manual behavior: if a live electronic hold claims stock, a manual order cannot transition to paid using that reserved quantity. Once the hold expires or releases, the manual path works as before.
- Roll back only after pausing new electronic payments and reconciling any captured-but-unfinalized intents. Keep payment events, intent ledger, order links, and captured orders for audit. Then disable the G21 stock/expiry triggers and restore the original V401 coupon function from its migration. Do not delete G18/G20 rows or reverse V47 stock changes as part of schema rollback.

## SQL rollback file

`supabase/rollback/20261018220000_kinto_payment_confirmation_g21_ROLLBACK.sql` is a review aid for an isolated test database. It is not approved for production execution and retains payment/order audit rows.
