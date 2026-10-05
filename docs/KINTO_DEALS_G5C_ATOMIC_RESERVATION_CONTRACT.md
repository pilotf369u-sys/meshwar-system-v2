# KINTO DEALS G5C — atomic redemption contract (design gate, feature OFF)

Status: design only; no SQL migration or live reservation endpoint in this PR. Based on live G5C preflight and guard postflight (6/6 TRUE). G5B is nonbinding.

## Verified live facts
- `orders.id` UUID, `orders.customer_id` TEXT, no `orders.store_id`.
- `order_store_segments(order_id,store_id)` is the canonical per-store linkage.
- `kinto_deals_v1_redemptions` has required real `order_id` FK and unique `(campaign_id,order_id)`, customer/store UUID, states pending/confirmed/released/reversed, `qualifying_units` and frozen snapshot.
- Verified session `private.require_customer_review_session(text)` returns UUID; it also updates session last_seen_at.
- #737 guard compares `orders.customer_id = new.customer_id::text`, verifies matching store segment, campaign store and gift store. Guard postflight 6/6 TRUE.
- Flag `merchant_deals_enabled` remains OFF. No reservation routines or DEALS order triggers.

## Mandatory single-transaction sequence — not yet implemented
1. Verify customer session server-side and feature flag; reject guest claims. Accept a server-validated campaign and canonical paid items only.
2. Create each independent store order via existing V101/V97 contract within the **same transaction** as its DEALS redemption. No new alternate checkout, no stand-alone reservation with invented order_id. A separate DEALS wrapper must be reviewed against actual V101 return JSON shape before implementation.
3. Lock campaign row `FOR UPDATE` before rechecking latest approved submission, server time, pause/expiry, paid product qualification, customer usage and pending+confirmed allocation. Use deterministic campaign lock ordering for multi-campaign requests; do not use nonbinding G5B response as authority.
4. Validate order/customer/store by existing #737 guard and segment availability. Insert pending redemption once per actual order with immutable qualifying/gift/terms snapshot. Unique `(campaign_id,order_id)` handles this one relationship, not whole checkout retry idempotency.
5. Any failed validation or checkout must abort the entire transaction, leaving neither an order nor an allocation. A stable request-level idempotency key and retry response contract are REQUIRED before browser exposure.
6. Never decrement gift stock in reservation. G5D must put a zero-net gift line in canonical order snapshot and let V93 first-paid stock lifecycle deduct exactly once after variant/matrix validation; preserve per-store invoice.
7. State transitions must be idempotent, authorized, tied to actual payment/cancellation/refund events, and serialized against campaign allocation; no release merely because the browser closes. Pending/confirmed consume allocation; released/reversed do not. Exact cancellation/refund matrix is a hold point.
8. Limited purchase also checks total prior pending+confirmed qualifying units under the campaign lock. All limits checked again under lock even after successful G5B quote.
9. Apply #716: qualify from paid items before coupons; gift net zero excluded from coupon and earn. Audit V411 stacking before activation.

## Remaining evidence before write migration
- Confirm actual V101/V97 JSON return keys, order creation/segment trigger timing, and whether an external payment step separates order creation from paid status.
- Identify canonical order status vocabulary and transitions for cancellation, returns and failed payment; no order status CHECK constraint was found in G5C preflight.
- Determine request idempotency mechanism and verify how one-store order ID maps to each submitted campaign.
- Specify whether a rejected or expired pending payment consumes a merchant allocation and when it is safely released.
- Test two concurrent customers for last slot, duplicate retry, mixed-store checkout, stale approval, invalid customer ID, rollback, coupon/V411, and first-paid stock.

## Gate
Do not grant any browser EXECUTE on a write function, add order triggers, modify V97/V101, enable flag, or run a reservation migration until the evidence and cancellation matrix are approved. Next deliverable: read-only inspection of V101/V97 result and order lifecycle, then isolated write implementation with transaction/concurrency tests.
