# G5B customer quote: OFF / read-only gate

This is an **estimate**, not a reservation, checkout, invoice, price, stock allocation or promise of availability. G5A live preflight was supplied by Omar. Existing V97/V101/V310/V411 functions and triggers are untouched.

- Requires `private.require_customer_review_session(p_session_token)` before all work.
- Returns only `feature_disabled` while `merchant_deals_enabled=false` (expected for this phase).
- When a later separately approved launch enables the flag, validates latest approved submission + review event, server clock, store ownership of each paid product, threshold and pending/confirmed usage counts.
- Paid line input is untrusted, IDs/quantities only. Never use quote as authority for checkout, gift, price, stock or allocation; revalidate under row locks in G5C.
- `limited_purchase` excludes non-campaign paid items in the one-store quote; no gift for exclusive.
- No direct SELECT permissions on DEALS tables; only verified SECURITY DEFINER RPC. No writes or legacy trigger modifications.
- Remaining allocation is a **non-binding estimate** subject to concurrency.
- A future integration must independently verify product options and available stock, gift options, exact per-store order snapshot, cancellation/release semantics, coupon #716, V411 conflict and loyalty base.

Run migration only after CI green and merge. Run `docs/KINTO_DEALS_G5B_POSTFLIGHT_READONLY.sql` and expect 6/6 true. No live UI call in this gate.
