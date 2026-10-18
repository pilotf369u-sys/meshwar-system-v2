# Payment-P4 preflight — temporary holds and payment-attempt ledger

## Decision

This branch is a **read-only dependency review**, not the P4 migration. A temporary hold can be serialized against other P4 holds, but the current manual paid-order transitions do not read or subtract those holds. A hold table and reserve RPC alone therefore cannot guarantee that a manual order will leave the reserved last unit available. The user explicitly excluded changes to the existing stock triggers, so the safe cross-workflow reservation is blocked until its narrow guard is reviewed.

No SQL was drafted or executed, no database was written, and no order, payment mode, or emergency-stop setting was changed. Main already contains G16, Payment-P2, and Payment-P3 (main base `d146b6a`). The G18–G21 implementation remains only on `feature/kinto-electronic-payment`; its SQL and tests are reference material, not installed prerequisites.

## Dependency findings

| Area | Repository behavior | P4 boundary |
|---|---|---|
| Canonical order creation | `checkout_independent_vendor_orders_v161` delegates to V101 and creates the existing per-store order records. The V161 wrapper has no customer-session parameter and is granted to `anon` and `authenticated` for legacy checkout. | P4 must not call V161. A later trusted finalizer can use the canonical per-store engine only after verified payment, inside one transaction. |
| Direct campaign orders | On the previous payment branch, `kinto_deals_v1_direct_order_g20` routes direct offers through the campaign checkout pipeline and creates an existing order. Direct offers are outside the cart payment path. | P4 must not absorb direct campaign orders or let cart coupons flow into them. |
| Coupons and rewards | V310/V401 apply coupons to an already-created eligible order, lock eligible coupon rows with `FOR UPDATE SKIP LOCKED`, update coupon status and the order discount snapshot, and write the loyalty ledger. The G20-C coupon-hold guard and G21 compatibility work are not on main. | Do not reserve, consume, or rewrite coupons/rewards in P4. A future coupon hold needs its own narrowly reviewed compatibility rule and expiry/release tests. |
| Single-item stock | `meshwar_local_stock_status_lifecycle` deducts total stock and configured variant stock on the first paid transition, writes its lifecycle marker, and locks the product row. | A hold must be a separate ledger row. It must never decrement `local_products.stock_quantity` or modify `options`; otherwise the paid lifecycle would deduct the same quantity again. |
| Cart-bundle stock | V93 locks affected products in product-ID order, checks grouped total quantities, then applies variant and `matrix_stock` deductions in the same paid-order transaction. | A reservation must validate total, variant, and exact matrix combination quantities. V93 remains the physical decrement path. |
| Multiple stores | The canonical checkout represents store orders separately; V94 maintains store segments and invoice projections from those order rows. | One payment-attempt group can contain lines for several stores, but P4 should not create KN orders or invoice projections. |
| Payment configuration | G16/P2/P3 are merged. The persisted emergency stop was confirmed enabled and manual mode/real collection closed after P2; P3 did not change those settings. Main has no merged G18 intent/admission tables or G20 quote/reservation tables. | P4 must remain disconnected from customer checkout; only a trusted server may later write attempts. Client-supplied price, quantity, status, or provider identity must not be authoritative. |

## Inventory race and why the current flow is insufficient

The G20-C draft locks affected `local_products` rows in a stable order, counts active unexpired reservation lines, and checks physical stock minus holds for the total, configured option buckets, and the exact `matrix_stock` key. This prevents two concurrent electronic reservations from claiming the same last unit, provided all reserve calls use those locks and counts. It does not alter physical stock.

That product lock ends with the reservation transaction. The existing manual paid-transition triggers later lock the product and deduct stock, but do not count active P4/G20 holds. A manual order can therefore consume a unit already promised by an electronic hold. The payment-side finalizer would then discover reduced physical stock after capture and require reconciliation/refund. This is a real cross-workflow gap, even though physical stock is not decremented by the hold itself.

The previous G21 draft addresses this with an additive `BEFORE UPDATE OF status` guard on `orders`: it locks the same product rows, re-reads stock after the lock, subtracts active total/variant/matrix holds, rejects a manual paid transition that would consume held stock, and excludes an electronic finalizer's own hold only under a server-set transaction context. It leaves V47/V93 as the only physical stock decrement path. That guard is not merged, changes the existing paid-transition behavior while a hold is active, and is outside this P4 approval. It is not copied here.

## Bounded solution for review before implementation

1. Keep the current manual path as-is. Do not open any payment attempt or reservation writer from the customer UI; keep manual mode, real collection disabled, and the global emergency stop on.
2. In a later, separately reviewed migration, add private/RLS-protected attempt, reservation, and reservation-line tables with a unique idempotency key, immutable server quote snapshot, provider-at-creation reference, explicit state constraints, and 15-minute expiry. No table row should represent an `orders` row.
3. Expose only service-role server RPCs for creating an attempt/reservation, releasing it, and reading sanitized verification results. Revoke direct table access from `PUBLIC`, `anon`, and `authenticated`; never accept authoritative amount/quantity/status from the browser. Use schema-qualified names and a pinned empty `search_path` for any `SECURITY DEFINER` function.
4. Reserve in one transaction: lock products in stable UUID order, recompute total/variant/matrix availability after active holds, insert the attempt and hold lines atomically, and leave physical stock unchanged. Expiry/release affects only hold rows. Do not touch coupons in this migration.
5. Before activating the reservation writer for real checkout, review and separately approve the narrow order paid-transition guard described above, plus a trusted payment finalizer. The finalizer must require a verified provider event, matching intent/amount/currency/customer, a live reservation, and idempotent transaction context; it then calls the existing per-store checkout/order engine and lets V47/V93 deduct once. P4 itself does none of this.

## Test gate for implementation

Run only against a disposable PostgreSQL/Supabase database with the exact prerequisite schema restored. Required scenarios:

- two simultaneous reservations racing for the final total-stock unit: exactly one succeeds;
- the same race for a configured color/size/volume bucket and for an exact `matrix_stock` combination;
- active holds reduce computed availability; expired and released holds do not;
- expiry, cancellation, and verified failure release only the matching hold; an ambiguous network outcome stays `reconciliation_required` and is not silently treated as failure;
- repeated idempotency key returns the same attempt and hold; repeated event/notification does not create another attempt;
- one attempt with lines from multiple stores creates no `orders`, `order_store_segments`, invoice, coupon, reward, or stock mutation;
- active electronic hold versus manual paid transition: manual transition is rejected while the hold is live and succeeds after release/expiry, with V47/V93 physical deduction exactly once;
- `anon` and `authenticated` cannot read/write attempt or hold tables, or invoke server-only writers; test amount/quantity/status tampering is denied;
- native PostgreSQL two-session locking test; PGlite/unit tests alone are not the concurrency gate.

None of these P4 database scenarios was run because no P4 migration has been written. The repository's prior G21 PGlite scenarios are evidence about that unmerged draft only, not a live Supabase test or P4 result. The production schema and trigger state were not queried.

## References

- `supabase/migrations/20261009_v161_new_orders_vendor_finance.sql`
- `supabase/migrations/20261005_kinto_deals_v1_g20_direct_order_pipe.sql` (previous payment branch dependency review)
- `supabase/migrations/20260928_v310_secure_kinto_loyalty_points.sql`
- `supabase/migrations/20260930_v401_campaign_cross_store_redemption.sql`
- `supabase/migrations/20260821_local_store_variant_stock_lifecycle.sql`
- `supabase/migrations/20260902_local_cart_bundle_variant_stock_fix_v93.sql`
- `feature/kinto-electronic-payment:supabase/migrations/20261018213000_kinto_stock_reservations_g20c.sql`
- `feature/kinto-electronic-payment:supabase/migrations/20261018220000_kinto_payment_confirmation_g21.sql`
