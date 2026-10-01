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
