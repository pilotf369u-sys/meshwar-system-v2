# KINTO DEALS G0 — first-pass dependency audit (2026-10-02)

Status: static repository inspection, NOT a live Supabase-schema audit. No production mutation.

## Verified source contracts
1. `supabase/migrations/20260905_v97_independent_vendor_checkout.sql`: `public.checkout_independent_vendor_orders(uuid,text,text,jsonb)` checks active stores, resolves product prices from database, checks requested stock, and inserts independent store orders. Existing grants include anon/authenticated; a future campaign-specific RPC MUST independently verify the actual customer session and never trust a supplied customer_id. Later migrations may have superseded the v97 function; verify live definition before implementation.
2. `supabase/migrations/20260902_local_cart_bundle_checkout_v93.sql`: `meshwar_local_cart_bundle_guard` locks paid bundle contents; `meshwar_local_cart_bundle_stock_lifecycle` deducts on first transition to `تم التسديد`, not merely at cart selection. Gift stock must be accounted for at this lifecycle or a deliberately reviewed reservation mechanism, without double-deduction.
3. `supabase/migrations/20260903_v94_order_store_segments.sql`: `public.order_store_segments` is a projection of existing orders with store-scoped invoice_version, customer_snapshot and totals; `private.v94_sync_order_segments` and insert/update triggers maintain it. No combined invoice is required or permitted by the feature.
4. `js/admin-customer-notices-v415.js`: admin composer uses verified admin session `window.KintoAdminSessionV147.read().token`, `admin_customer_notices_v415` for history, and `admin_send_customer_notice_v420` to send notices. New merchant-submitted-campaign notification should go to an admin review inbox first, not invoke `admin_send_customer_notice_v420` directly.
5. `supabase/migrations/20260929_v344_vendor_loyalty_controls.sql`: merchant-scoped RPC pattern uses `private.require_vendor_session(p_session_token)`. Campaign authoring should follow the same server-verified ownership pattern and not accept store ownership from browser assertions.
6. `supabase/migrations/20260912_v155_customer_smart_notifications.sql`: customer read-state keys are tied to `private.require_customer_review_session`; campaign notification should reuse established customer-notice infrastructure after admin approval rather than create a second badge/read-state implementation.

## Mandatory remaining inspections before schema/checkout changes
- Inspect latest live definitions and all later replacements of independent checkout, cart submission, stock triggers, invoice projections and shipping fee logic; a historical migration is not proof of deployed state.
- Trace actual merchant HTML/script entry, product variants/matrix stock, store page/cart and admin dashboard insertion points.
- Define campaign redemption unit: one free gift per **store order**; limited-purchase quantity versus campaign-use count are distinct; canceled-before-payment behavior and paid refund policy require sign-off.
- Define race safety (row locks/unique idempotency) for customer limit and gift stock. Prevent two parallel orders consuming the final gift.
- Define compatibility of campaign reward with existing loyalty/discount, currency and vendor/branch shipping; external shipping must not be waived accidentally.
- Admin inbox needs admin authorization, new submission badge, review details and optional promote-to-customers action; merchant never sends directly to customers.
- Feature flag OFF by default; all normal orders and invoices must remain byte-for-byte equivalent in semantics when campaign absent.

## Suggested integration seam (proposal, NOT authorization)
Isolated campaign tables and merchant/admin RPCs -> public active campaign read projection -> campaign intent validated server-side at checkout -> append immutable campaign snapshot to the existing store-scoped order details -> existing order status/stock/segment/invoice flow. Exact seam pending G0 live verification. No alternate order creation path.

## Explicit execution status
Only documentation PR #706 updated. No migration generated/applied, no live schema changed, no PR merged, no GitHub CI claimed green.

## Second-pass entry points and isolation findings
7. `vendor-dashboard.html` is a shell loading `vendor-dashboard-v2.html` and injecting optional vendor scripts into its frame; the actual merchant tab markup lives in `vendor-dashboard-v2.html`. Campaign wizard should use an isolated script and container in the inner frame, with shell injection audited before implementation. Existing notifications tab exists (`vendorTab-notifications`), but that is **merchant-facing**, not the required admin campaign-submission inbox.
8. `js/local-cart-v93.js` implements global multi-store cart, scoped item keys, `checkout()`, and `buildStores()`. `js/customer-local-cart-v125.js` is a dashboard bridge, not the canonical checkout engine. Campaign selection must not assume one cart equals one store; preserve grouping and only decorate the eligible store's independent order.
9. `supabase/migrations/20261001_v420_customer_notice_linked_stores.sql` adds `kinto_customer_notice_stores_v420` and `admin_send_customer_notice_v420`, with optional up-to-20 linked stores. This is an **admin-authorized outbound customer notice**, not a merchant-to-admin inbox. New campaign review events need a distinct admin inbox/read-state path, then an explicit admin action can reuse v420.
10. `supabase/migrations/20260921_v140_checkout_group_finance.sql` adds `checkout_group_finance`, a checkout-group-level external shipping envelope with collector segment. A merchant's free-shipping campaign must not zero or rewrite this group-level fee.
11. `supabase/migrations/20260905_v112_multicurrency_rewards_order_discount.sql` adds existing per-order loyalty discount columns and reward snapshot. Campaign discounts must be distinct and have a documented stacking rule; do not repurpose loyalty columns.

## Concrete handoff: independent work vs owner sign-off
**Safe to prepare on feature branch without SQL or production deployment:** documentation, isolated CSS and mock-data campaign preview, client-side form draft validation, admin inbox UI mock, non-destructive CI contract tests, test matrix and feature-flag scaffolding default OFF. Do not wire real product ordering until G0 complete.
**Requires Omar to run SQL (only after review):** one additive campaign schema/RPC migration, separate later integration migration only if necessary; supply exact file, prerequisites, expected success, and rollback/disable behavior.
**Requires explicit product/financial discussion:** whether repeated same SKU counts toward N, per-customer campaign-use versus quantity cap, cancel-before-payment and paid return/reversal, gift allocation timing, compatibility with loyalty coupon and store shipping discount, whether an admin approval is required to activate (distinct from admin promotion).
**Requires live smoke test after every activation:** merchant isolation, admin inbox badge, existing admin customer notice, ordinary cart, mixed-store cart, order payment/status, stock, each store's existing invoice, shipping and mobile.

## Strict work order after this document
A. Finish G0 read-only call graph with exact current checkout function and frontend RPC invocation, all order trigger names, invoice render sources, merchant session and admin authorization.
B. Submit an architecture-only PR and confirm tests; no production changes.
C. Build G1 isolated migration in a separate PR, leave unapplied until Omar explicitly runs and verifies it.
D. Build G2 merchant wizard behind OFF flag; G3 admin inbox; G4 storefront, each independently tested.
E. Only after financial sign-off build G5 checkout bridge and gift stock lifecycle; run concurrency tests.

## Critical corrected checkout seam (third-pass)
12. Exact frontend call at `js/local-cart-v93.js:52` is `rpc/checkout_independent_vendor_orders_v101` (NOT the older unsuffixed v97 function). Request body: `p_customer_id`, `p_customer_name`, `p_customer_phone`, `p_customer_shipping`, `p_items`; each item currently carries only store_id, product_id, selected_options and quantity. This is the decisive integration target to audit against its latest SQL definition and any subsequent wrapper. Do not append campaign data to this request or replace this RPC until G5 signed off. This discovery supersedes any suggestion that v97 is the current frontend entry point.
13. `js/local-cart-v93.js:51-52` groups selected items by store, expects independent returned orders, and only removes submitted cart item keys after checkout. Campaign should preserve the success/failure and cart cleanup semantics, especially when an ordinary store and a campaign store coexist.
14. Frontend currently sends a customer ID from cart scope; campaign eligibility must require server-verified customer identity and cannot rely on this ID as proof of ownership.

## Morning handoff (no user action needed for documentation)
- PR #706 remains architecture-only. Read this audit and map first.
- Next engineering task: locate the last definition of `checkout_independent_vendor_orders_v101`, compare customer-session validation and stock/payment triggers, and identify the precise order invoice renderer. Write tests before changing checkout.
- SQL: NONE to run yet. Discussion: only unresolved campaign financial policy, before G5. Merge: architecture PR can be reviewed independently; no campaign feature is live.

## Fourth-pass precise SQL wrapper and invoice mapping
15. `supabase/migrations/20260905_v101_checkout_shipping_destination_fallback.sql:221-251` confirms v101 is a SECURITY DEFINER wrapper validating `p_customer_shipping`, setting transaction-local `app.checkout_customer_shipping`, then delegating to `public.checkout_independent_vendor_orders(p_customer_id,p_customer_name,p_customer_phone,p_items)`. Thus both v101 and underlying v97 definition (including later replacements, if any) must be audited together. Replacing the wrapper carelessly would lose shipping destination propagation.
16. `js/vendor-v94-multistore-orders.js:117-125` has `hydrateVendorCanonicalInvoice`, `vendorRewardGrand`, `storeInvoiceDocument`, `finalizeInvoiceFrame`. This is the existing merchant **per-store** invoice renderer. It already handles reward discounts, shipping and totals; campaign financial display needs an additive, reviewed snapshot adapter rather than another invoice implementation.
17. `admin-dashboard.html:265-276` has an existing admin notifications module that calls `admin_vendor_notifications_v391`. It is separate from `admin-customer-notices-v415.js` outbound customer notices. Campaign submission can surface in the admin area, but the direction must be merchant -> admin, not confused with admin -> vendor or admin -> customer messages.

## Baseline CI artifact
`ci/kinto-deals-g0-baseline-contract.test.mjs` is a read-only Node test asserting existing source contracts. Run `node --test ci/kinto-deals-g0-baseline-contract.test.mjs` on the branch. These are regression sentinels, not proof of live Supabase schema or E2E functionality.
