# G5C live lifecycle findings — verified 2026-10-02

Evidence: live metadata preflight `KINTO_DEALS_G5C_SEGMENT_STATUS_PREFLIGHT_READONLY.sql`, returned by project owner. Feature OFF.

## Confirmed
- `private.v94_sync_order_segments(uuid)` runs via AFTER INSERT and AFTER UPDATE triggers on orders for `source=local_cart_bundle`, groups canonical `details.items` by store_id and upserts `order_store_segments`. Thus a successful V97 insert creates segment within the same SQL statement/transaction, before V97 returns its order ID.
- The segment's `payment_confirmed` is derived from `bundle_stock_lifecycle_state=deducted` or order status `تم التسديد` / `paid` / `Paid`; upsert uses old.payment_confirmed OR excluded.payment_confirmed (monotonic), and preserves paid snapshots. It is NOT a signal that a cancellation is reversible.
- No user-defined triggers on `order_store_segments` were reported. Do not assume segment status writes automatically transition DEALS redemption state.
- `vendor_advance_order_segment_status` verifies vendor session, requires `payment_confirmed=true`, locks segment and parent order, then mirrors independent order status via `private.v103_sync_independent_order_status`.
- Redemption constraints: required actual `order_id` FK, unique `(campaign_id,order_id)`, state in pending/confirmed/released/reversed, qualifying_units>=1, object snapshot. #737 guard checks order customer text and segment store.
- V97 returns `{checkout_group_id,order_count,orders:[{id,order_code,store_id,store_name,total_price,currency,status}]}`; V101 delegates V97. First status `انتظار رد الموظف`. V93 stock only deducts first `تم التسديد`.
- Existing order status is TEXT, not a PostgreSQL enum. Loyalty V310 recognizes cancellation `ملغي`, `ملغي من قبل العميل`, `رفض الطلب`, `مرفوض`; legacy stock routine additionally lists `رفض التسليم`, `ملغى` but only for `source=local_store`. Never blindly reuse this list for DEALS.

## Implementation hold points
1. Reservation must share the SAME database transaction as canonical V101/V97 order creation. Since V97 inserts and its AFTER INSERT segment sync runs before return, #737 guard can validate actual segment before redemption insert.
2. Campaign row lock must be taken before any availability/customer cap check and retained through insert. Determine ordering relative to checkout stock locks and multi-store requests; avoid deadlock by canonical UUID order.
3. Existing V101 cannot accept a deal or gift line, and existing V97 reprices every p_items entry as a paid product. Therefore passing a gift as an ordinary item WOULD CHARGE FOR IT. Do not do that. G5C reservation-only must NOT promise gift fulfillment or mark it redeemed/confirmed before G5D canonical snapshot and invoice adapter.
4. Decide explicit request-level idempotency (not covered by unique campaign/order), and whether a reservation-only endpoint is internal/non-browser until gift integration. No feature flag activation before G5D/G5E.
5. Pending allocation counts until a verified pre-payment cancellation/rejection in an approved lifecycle handler. Never release on browser disconnect, time alone, a vendor status update, or an unauthenticated callback.
6. Confirmed allocation remains counted through delivery; refunds/reversals need separate policy and audit. Segment payment_confirmed is monotonic and cannot by itself represent refund.
7. Merchant exclusive limited_purchase has no gift, but still needs verified paid-product/order association and total units/customer under campaign lock.
8. V411 admin-funded discount and V310 loyalty need integration tests per #716; no order total/stock mutation in G5C.

## Next safe code gate
Create isolated PRIVATE non-browser reservation helper that accepts a real canonical order ID, verified customer UUID from its caller, and campaign ID; it locks campaign and validates actual order+segment+paid line qualification and limits. Keep it ungranted to browser, not called by checkout yet, and feature OFF. Before a public checkout wrapper, settle idempotency and G5D gift snapshot mechanics. A function not invoked by canonical checkout is NOT atomic end-to-end and must never be described as a complete redemption system.
