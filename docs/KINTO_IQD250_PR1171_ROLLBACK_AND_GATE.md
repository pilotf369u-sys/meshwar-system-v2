# KINTO — IQD 250 pricing rollout gate (2026-11-22)

**Status: BLOCKED. Documentation only; do not execute SQL or deploy PR #1171.**

## Rollback points established *before additional work*
- `safety/pre-iqd-250-main-20261122`: snapshot of the GitHub main branch before release
- `safety/pre-iqd-250-hostinger-20261122`: snapshot of Hostinger release branch before release
- Production Supabase has **not** been mutated by this work. GitHub branch snapshots are **not** database backups.
- Before any SQL change: obtain separate verified database schema/function definition backup, a verified restore route, and required owner approval. Never rollback a DB using only GitHub source assumptions.

## Required pricing contract
- Merchant regular price from cost + 45% (configurable) retains cents; discount price is a separate explicit merchant entry.
- KINTO 5% is the settlement commission on gross merchandise proceeds (after vendor-funded coupon). Client customer price currently *grosses up* the merchant price with `vendorUSD/(1-rate)`. Do not add 5% to vendor cost a second time.
- Only round final line price once: `ceil((vendorUSD/(1-rate))*FX/250)*250` IQD. For a $1 vendor discount, 5%, FX 1770: 2000 IQD.
- Preserve quantity multiplication, frozen line totals, orders, vendor settlements, discounts, delivery/shipping separation, order statuses, invoice rendering and payout precision.

## Source/checkout dependency trace — verified from repository only
1. Merchant source: `js/vendor-barcode-margin-autopricing-v22.js`; `base_price`, `discount_price`, `cost_price`.
2. Public pricing: `js/local-store-pricing.js` via `MeshwarLocalPricing`; `js/local-store-product-details-v4.js` reads into `KintoLocalCartV93.addItem`.
3. Additional public rendering: `js/local-store-enhancements.js` separately rounds USD; check whether page is live before modifying.
4. Cloud cart: `js/local-cart-v93.js` sends item IDs/quantities but **not authoritative local prices**.
5. Manual checkout: `public.kinto_checkout_session_v1` -> `checkout_independent_vendor_orders_v161` -> `v101` -> base V97 SQL. Base source currently contains `ceil(vendorUSD/(1-rate))` and `ceil(.../1000)*1000`.
6. Electronic simulation: `private.kinto_payment_p5_quote_v1` from `supabase/migrations/20261019040000_kinto_payment_p5_simulator_checkout.sql` re-quotes from DB using old rounding; later `supabase/migrations/20261118090000_kinto_campaign_checkout.sql` calls the quote function.
7. Gift price: `supabase/migrations/20261002_kinto_deals_v1_g5e_private_gift_line_off.sql` contains the old method. Check actual installed version of function before changing it.
8. Invoice/settlement: `order_store_segments.items_snapshot`, finance snapshot commission and net, frozen totals. These should be regression-tested, not rewritten.

## Blocking verification
- Confirm the *active* live SQL function definitions using read-only Supabase queries; historical migration text alone is not the deployed definition.
- Versioned SQL migrations must preserve function signatures, locks, verified customer sessions, cart/order atomics, shipping propagation, finance snapshot creation, P5 quote/campaign behavior, privileges and security-definer search_path.
- Compare client displayed price / cart / **server quote** / created order / segmented invoice / vendor settlement for discounted and regular prices, each store, multiple quantities, coupon funding, gifts, P5 simulation. Verify old order snapshots unchanged.
- Existing CI on draft PR #1171: 10 passed, 3 failed. Protected-function checks in vendor barcode + vendor product edit **explicitly assert original `Math.ceil` body remains unchanged**; update guards only after reviewed scoped allowance. E2E: 2 failing vendor tests, 165 passing. Do not mark green based on deleting assertions or skipping tests.
- Another draft PR #1169 changes the same V22 merchant script to fix margin hydration; reconcile on main after review, avoid losing either fix.
- No merge, Hostinger promotion, SQL execution, payment mode switch, or live-product price rewrite without explicit approval after green checks.

## Recovery
- If a **frontend-only** rollout fails, revert the associated release commit or restore the exact corresponding files from the pinned safety branch. Use a fresh verified deploy, not browser caching to judge rollback.
- For DB/SQL changes, STOP and follow a separately prepared rollback of actual deployed definitions (function-level restore), ensuring compatibility with orders already created since the change. No blind generic rollback or destructive restore of live data.
