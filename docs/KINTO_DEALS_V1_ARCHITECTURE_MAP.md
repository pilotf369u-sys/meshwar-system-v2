# KINTO DEALS V1 — architecture map and decision ledger (DRAFT / NO IMPLEMENTATION)
Date: 2026-10-02. This is a guarded architecture document, not permission to change checkout, finance or live data.

## Locked product decisions
- Campaign belongs to exactly one local store. Merchant creates it with a short guided wizard, preview, start/end time, participating products and optional reward.
- Three independent configurations: (a) select N eligible products and receive merchant-preselected gift; (b) buy N eligible items and receive merchant-preselected gift (one gift maximum per store order); (c) limited-purchase campaign without mandatory discount, gift, or free shipping. Eligible internal shipping waiver is another optional reward, NEVER an automatic waiver of external shipping.
- Merchant sets maximum campaign uses per verified customer; default 1. Limits enforced server-side across orders, never localStorage. Define precise accounting of cancellations/refunds before implementation.
- Each store has its OWN independent invoice; no combined invoice. Reward and its full discount appear only on that store invoice. Other store invoices are untouched.
- A submitted merchant campaign generates an ADMIN notification with merchant identity, campaign summary, dates, link to review and promotion action. Admin chooses whether to send customer notification via existing admin notice workflow; merchant must not directly broadcast customer notices.
- Campaign can be drafted, scheduled, active, paused, expired. Prior confirmed order snapshots stay immutable.
- Product eligibility, ownership, prices, stock, gift entitlement, customer limit, time and replay/concurrency must be checked on trusted server transaction. No trusting browser totals or a disabled button.

## Confirmed code map (verified against main file tree and inspected headers)
Merchant-facing: vendor runtime + js/vendor-v94-multistore-orders.js; inspect actual merchant HTML and product-save RPCs before choosing insertion point.
Storefront: local-stores.html (store listing), store.html (individual store), local product/cart UI and js/order-modal-entry-v85.js.
Checkout: supabase/migrations/20260905_v97_independent_vendor_checkout.sql defines public.checkout_independent_vendor_orders and resolves prices from DB; supabase/migrations/20260902_local_cart_bundle_checkout_v93.sql documents stock deduction at first paid transition for bundle orders. These are audit targets, NOT approved edit targets.
Store order projections: supabase/migrations/20260903_v94_order_store_segments.sql adds public.order_store_segments without replacing public.orders.
Merchant invoices: js/vendor-v94-multistore-orders.js and relevant invoice scripts; verify actual rendering/financial RPCs and current deployed migrations before integrating.
Admin notice composer: js/admin-customer-notices-v415.js; customer display: js/customer-admin-notices-v416.js. Inspect current notice RPC/schema and admin session rules before connecting.
Other audit targets: shipping sources and branch-vs-store fee exclusivity, current reward discounts, customer verified session, merchant session, inventory variants/matrix, refund/cancellation paths, product listing, admin dashboard and CI.

## Directional connections (proposed; subject to full contract audit)
merchant session -> merchant-owned campaign draft/submit -> server validates store and products -> admin inbox notification -> admin review/optional promotion -> existing admin customer notice composer -> customers
active campaign read-only projection -> store listing badge + top-of-store banner -> isolated interactive campaign page -> server-side campaign eligibility preview -> existing independent-store checkout (one narrowly reviewed integration) -> per-store order reward snapshot -> per-store invoice.
Customer limits and gift stock must be transactional; preserve original payment, order status, tracking, shipping, and invoice semantics.

## No-touch boundary until explicit sign-off
Do not change existing checkout RPCs, stock triggers, orders, segment lifecycle, payment statuses, customer/vendor/admin auth, shipping logic, invoices, or production SQL during phases 1–4. No alternate checkout engine. No auto-publish or customer broadcast. Feature flag defaults OFF. All campaign objects should be additive and isolated. Backward compatibility for orders without campaigns is mandatory.

## Implementation gates
G0: inspect live repository contracts and deployed Supabase schema (read-only), identify exact call graph and migrations, regression tests and rollback plan; update this map with verified links, unresolved assumptions and approved integration proposal.
G1: isolated additive campaign schema + RLS/RPC, idempotent migration, permission tests; provide ONE reviewed SQL migration for Omar to apply when ready.
G2: merchant campaign wizard, draft/preview, safe submission.
G3: merchant-to-admin notification inbox and admin-controlled promotion through existing notice path; no automatic customer broadcast.
G4: store badges/banner, campaign modal/page, eligibility UI; no checkout changes.
G5: separate written financial/checkout sign-off: one gift per store order, per-customer use count, order-level snapshots, shipping scope, cancellation/refund, atomic stock and race behavior; then narrow integration.
G6: E2E and security tests (guest, other merchant, replay, over-limit, concurrent checkout, expired campaign, out-of-stock gift, invoice isolation, noncampaign checkout, mobile); green CI + Omar live acceptance + stable checkpoint.

## Stop conditions
Any unexpected dependency or regression in login, checkout, order statuses, shipping, invoices or tracking stops merge. Never treat GitHub green as sufficient production proof. Every phase uses its own PR and rollback point.

## Status
Initial inventory complete; detailed contract audit G0 NOT YET COMPLETE. No production changes, no SQL executed, no campaign feature enabled.
