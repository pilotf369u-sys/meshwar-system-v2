# KINTO G20 review, pricing, and reservation handoff

## What the customer review does

The existing cart button opens **مراجعة الطلب والدفع** and reads selected real cart rows. It sends only store/product IDs, quantity, and selected color/size/volume to the server quote. The review shows product images, store grouping, quantity, variants, server prices, product markdown savings, store coupon discount, and product payable total. Shipping is excluded. Direct KINTO Deals remain outside the cart and the quote path cannot attach a coupon to a direct deal.

The manual checkout remains available if the quote RPC is missing or unavailable. The G20 button calls the existing cart checkout once at a time; it does not remove cart rows. The existing legacy checkout removes submitted rows only after its canonical RPC returns validated KN orders. If the legacy RPC itself times out after committing on the server, that legacy RPC has no client idempotency key in this repository; do not automatically retry an ambiguous timeout before checking the existing orders view. This is an existing integration boundary, separate from a failed G20 quote call.

## Price contract and currencies

G20-B uses the V97 calculation stages without modifying V97 or the legacy pricing engine:

1. `customer_price_usd = ceil(vendor_price / (1 - commission_rate / 100))`.
2. `unit_price_local = ceil((customer_price_usd * exchange_rate) / 1000) * 1000`.

The quote includes both the regular/base-price result and discounted-price result, so product savings remain distinct from a store coupon. Coupon caps remain tied to the existing `max_order_ratio` and `coupon_unit` settings, and eligible coupons remain scoped to their own store/campaign. Direct deals remain coupon-free.

A mixed-currency cart displays each store subtotal and payable amount in that store's original currency. It is not silently converted, summed as a single payable, or eligible for a single electronic intent. Such carts are manual-only until a conversion/settlement policy is explicitly approved. Single-currency electronic checkout is also disabled in this stage. No provider has been selected.

## Staged SQL and engine boundaries

| Stage | File | Purpose | Touches existing paid-order engine? |
|---|---|---|---|
| G20-A | `supabase/migrations/20261018194000_kinto_payment_review_quote_g20.sql` | Initial server quote endpoint and quote snapshots | No |
| G20-B | `supabase/migrations/20261018210000_kinto_payment_review_quote_g20b.sql` | Strict option/matrix validation, V97 price snapshot fields, per-currency totals | No |
| G20-C | `supabase/migrations/20261018213000_kinto_stock_reservations_g20c.sql` | 15-minute stock and coupon holds, idempotency, safe release | No |

The reservation stage locks product rows in stable UUID order and counts unexpired holds against total, configured variant, and exact matrix stock. It reserves selected coupon IDs once per active reservation and rechecks coupon/store scope and the current coupon cap. A narrow trigger blocks the existing V310 coupon consumer from marking a coupon used while another live payment reservation owns it; the future trusted finalizer must set the reservation-scoped transaction context after locking the same reservation. The hold rows are separate from `local_products`; the migration never changes physical stock and never inserts or updates `orders`. V47 remains the existing physical stock decrement when the canonical paid transition occurs.

G20-C currently implements reserve and customer release only. It is not connected to a gateway, cannot create production payment attempts, and has no finalize/consume endpoint. Before gateway work, an approved finalizer must consume the same reservation idempotently, revalidate the held line against current physical stock, call the canonical order engine, and allow the existing paid transition/V47 to deduct once. A conflict after verified capture must enter reconciliation/refund; it must not publish a partial paid order.

These staged files must be reviewed against a disposable Supabase project after the G20 prerequisites are restored there. The quote depends on V94/V97/V132/V310/V401 and the existing `meshwar_matrix_stock_key`; reservation additionally depends on the loyalty coupon schema. I could not run PostgreSQL/Supabase locally in this workspace, and no SQL was run against production.

## Risks and rollback

- A temporary hold reduces availability only for the new electronic reservation path. The legacy manual checkout does not subtract G20 holds. Therefore finalization must check current stock again; holds alone do not prevent a concurrent legacy manual order from consuming the same physical stock.
- Existing V47 behavior is intentionally unchanged. A missing/invalid matrix combination is rejected by G20-B/G20-C before payment setup, because V47 may skip a missing matrix key.
- Holds expire after 15 minutes and remain auditable in the ledger. Expired rows are ignored by availability; cleanup may mark them expired later. A late provider success must be reconciled and cannot reuse an expired hold blindly.
- G20-B changes quote amount/currency to nullable only for multi-currency review snapshots. Reserve rejects those quotes. Before production, test constraints against the actual G20-A migration state in an isolated database.
- G20-C introduces foreign keys to existing product and loyalty coupon tables and a guarded coupon-consumption trigger. Validate exact IDs/types, V310 rollback behavior, and grants on the disposable project before any approval to apply SQL elsewhere.

To roll back **before any later stage depends on these tables**, stop using the quote/reserve RPCs, inspect and reconcile active reservations, then roll back C before B before A. Do not delete active or consumed financial evidence. The C rollback must first export/reconcile reservation data and release or account for all active holds; only then may its RPCs/tables be removed. The G20-A quote table must remain until all G20-B/C references are removed. For production, present each SQL block and its staged rollback separately and wait for explicit approval.

## Executable checks

- `npm run test:payments` exercises G18/G19/G20 JavaScript, exact legacy pricing numbers and rounding boundaries, coupon cap boundaries, and a concurrent manual-fallback attempt that verifies one legacy invocation and retained cart rows on failure.
- `supabase/tests/kinto_payment_review_g20b.sql` runs the installed PL/pgSQL options helper against valid, missing, invalid, and zero-stock color/size/volume matrix choices. `supabase/tests/kinto_stock_reservations_g20c.sql` runs the actual reservation availability helper at exact last-unit and held-quantity boundaries. Run both only after G20-A/B/C on a disposable Supabase test project.
- `node --check` for changed JavaScript and `git diff --check`.

The SQL integration test has not been run because no local PostgreSQL, Supabase CLI, or Docker runtime is available here. Browser E2E against real customer/session data and concurrency testing (last item, two holds, coupon competition) remain required on the isolated project before any gateway is enabled.
