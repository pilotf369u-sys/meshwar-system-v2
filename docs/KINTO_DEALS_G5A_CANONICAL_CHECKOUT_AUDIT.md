# KINTO DEALS G5A — canonical checkout integration audit (NO RUNTIME CHANGE)

Status: design/preflight only. Feature `merchant_deals_enabled=false`. Reference: [#716](KINTO_DEALS_V1_GIFT_COUPON_COEXISTENCE.md).

## Confirmed source locations
- `js/local-cart-v93.js` calls `checkout_independent_vendor_orders_v101(customer_id,name,phone,shipping,items)`. Browser-supplied customer ID is not sufficient proof of identity.
- `20260905_v101_checkout_shipping_destination_fallback.sql` validates destination, carries shipping via transaction-local setting, and delegates to `checkout_independent_vendor_orders` (V97). Do not replace this adapter or duplicate its per-store order construction.
- `20260905_v97_independent_vendor_checkout.sql` validates paid item/store IDs, server prices, active stores and aggregate stock; groups items by store and freezes per-store order data.
- `20260902_local_cart_bundle_variant_stock_fix_v93.sql` handles total, variant and matrix stock at first `تم التسديد` with an exactly-once marker. Gift quantity/options must be included in the canonical stock representation exactly once; never decrement stock in a DEALS UI/RPC independently.
- `20260928_v310_secure_kinto_loyalty_points.sql` applies earned loyalty on delivery and same-store coupon cap against order merchandise total; gift must be excluded from this eligible paid base.
- `20261001_v411_campaign_instant_order_discount.sql` has a separate BEFORE INSERT order trigger; chooses an active admin-funded KINTO campaign, snapshots discount, and intentionally catches failures. DEALS cannot silently stack discounts with this.
- `20261002_kinto_deals_v1_g4f_vendor_submit_off.sql` creates review submission only, never a redeemable campaign.
- G3A approval leaves campaign status `submitted`; customer eligibility must derive the latest approved decision and server clock, not infer approval from status alone.

## Required server contract BEFORE any implementation
1. Authenticated customer session identity must be verified server-side. Never trust `p_customer_id`, campaign IDs, prices, gifts or discount totals from the browser. Guest checkout cannot claim a DEALS reward.
2. Atomic one-store campaign qualification from **paid** canonical line items only: `choose_n` distinct eligible paid product IDs, `buy_n` paid quantities, `limited_purchase` max units/customer. Check campaign's own store, approved latest submission, starts_at <= server clock < ends_at, not paused/retired, flag ON, and allocation remaining under locks.
3. Gift is one preselected merchant gift per qualifying store order (not per threshold multiple), with catalog price and 100% gift-specific discount frozen in existing per-store order/invoice snapshot; gift has net zero, no extra order or invoice. Revalidate selected options, total and variant/matrix stock in canonical payment lifecycle. Cross-store items cannot qualify.
4. Redemption identity and limits: verified customer ID, campaign/customer lifetime confirmed+pending count, allocation reservation, unique campaign/order idempotency, lock order/campaign/stock consistently; define cancellation/refund release versus irreversible consumption before writing.
5. Loyalty #716: same-store earned coupon may coexist with gift or ordinary-price limited purchase, max 10% of paid merchandise only; exclude gift and shipping from coupon base and earn. Evaluate gift before coupon. Future direct line discount requires a separate anti-stacking contract.
6. V411 coexistence must be explicit: admin-funded instant order discount is a separate order-level promotion. Choose a documented precedence/exclusion rule and test it before enabling DEALS; never silently apply multiple promotional benefits to an already discounted line.
7. Preserve shipping quote, external shipping outside vendor revenue, per-store segments, invoice frozen snapshot, return/cancellation lifecycle, and all non-DEALS orders bit-for-bit when flag OFF.
8. Activation requires full E2E: two stores in one cart; no gift leakage; gift stock exactly once on paid status; coupon; admin-funded campaign collision; stale approval; concurrent last allocation; duplicate checkout/retry; customer ID spoof; cancellation; mobile/desktop invoice.

## Gate order
G5A audit/preflight (this PR) -> G5B verified read-only eligibility/quote OFF -> G5C controlled atomic reservation/checkout adapter OFF -> G5D canonical stock/invoice/loyalty integration -> G5E concurrency and E2E -> G6 storefront/media -> G7 release approval. No early flag enablement.

**Open decisions requiring verified DB evidence:** exact active checkout function definitions/trigger order in live Supabase (migration files may have later replacements); customer-session function output shape; V411 + coupon precedence; gift snapshot field format; cancellation/reversal states. Collect read-only preflight rather than guessing.
