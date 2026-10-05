# KINTO DEALS V1 — decision queue and safe implementation gates

This file is an implementation handoff, not an applied migration. The current production checkout, admin-funded campaigns and store invoices remain unchanged.

## G0 findings that dictate architecture
- Browser checkout: `js/local-cart-v93.js` -> `checkout_independent_vendor_orders_v101` -> existing `checkout_independent_vendor_orders`. The wrapper carries shipping destination using a transaction-local setting. The underlying function calculates prices and inserts one order per store.
- Current admin-funded `kinto_campaigns` are **not** merchant-created DEALS. Their v411 BEFORE INSERT trigger freezes a separate KINTO-funded product discount, without rewriting `orders.total_price`.
- Store invoice already exists: `js/vendor-v94-multistore-orders.js` / `storeInvoiceDocument`. No new invoice subsystem.
- Payment transition is the stock deduction point for local-cart bundles, including total, variant and matrix quantities; inspect actual live trigger state before touching.
- Admin notification directions are different: v405 admin -> merchant, v420 admin -> customer. DEALS requires merchant -> admin submission, and a later optional admin -> customer promotion.

## Implementation boundaries
1. Separate namespace: `kinto_deals_v1_*`; feature flag defaults OFF; merchant submits only for server-derived owned store.
2. No direct client writes to campaign tables. Merchant/admin/customer endpoints each require their verified session.
3. Merchant chooses participating SKUs and optional preset gift, count threshold, max campaign uses per customer, purchase quantity cap and duration. Gift is one per qualifying **store order**, not per qualifying item or per threshold multiple.
4. Product pricing and all stock checks are server authoritative. Gift invoice presentation should show catalog price plus an equal 100% merchant-funded promotional reduction. Never create an invoice for another store.
5. No client-side timer is trusted for eligibility. Snapshot accepted terms in each qualifying order. Handle concurrent submissions and idempotent retry at the DB layer.
6. No change to group-level external shipping, existing KINTO-funded discount fields, loyalty balance or status workflow without an explicit signed-off stacking/accounting policy.
7. All ordinary checkout behavior must remain unchanged when the DEALS flag is OFF.

## Decisions Omar must approve before financial integration (G5)
| Topic | Proposed default for discussion | Why sign-off is needed |
| --- | --- | --- |
| Counting N products | Count paid unit quantities from eligible SKUs; configurable distinct SKU mode later | e.g. buying 2 of the same product |
| Per-customer campaign uses | One successful qualifying store order by default; merchant may set higher | Do not confuse use limit with per-product quantity cap |
| Cancellation before payment | Release pending entitlement and do not count redemption | Must align with existing prepayment cancellation |
| Refund after payment | Keep immutable original campaign snapshot; refund/reversal recorded separately | Existing post-payment cancellation is closed |
| Gift allocation | Validate gift and selected variant before acceptance; deduct with canonical paid stock transaction | Prevent oversell and double-deduct |
| KINTO-funded v411 discount + DEAL | Leave coexistence disabled pending explicit policy | Separate funding, invoice and ceiling |
| Internal shipping promotion | May only affect merchant-owned internal fee after exact source audit | External checkout-group fee remains intact |
| Admin review | Merchant submission goes to admin inbox; admin promotion is optional and separate from campaign activation | Distinguish review, activation and marketing |

## Delivery sequence with stop/go
- G0: finish latest migration/live RPC/trigger audit; source contract tests included in PR #706.
- G1: additive OFF-by-default schema/RLS and verified read-only endpoints in a **new PR**. Give Omar one complete SQL file, preflight, expected output and disable/rollback instructions. Do not execute on his behalf.
- G2: merchant campaign wizard in the actual vendor frame; preview/mock mode first; then secure draft/submit after G1 acceptance.
- G3: distinct admin submission inbox and badge; merchant cannot broadcast.
- G4: store listing badge, store-page banner and responsive countdown campaign detail; eligibility server-rechecked.
- G5: financial/checkout/stock integration only after decision table is signed off and race/idempotency tests exist.
- G6: invoice additive adapter, end-to-end tests, feature flag gradual enable, production smoke test and checkpoint.

## Regression checklist
- Guest browsing; signed-in customer; forged customer/store ID rejected; two merchants isolated.
- Ordinary single-store and mixed-store checkout unchanged; one independent invoice per store.
- KINTO-funded campaign v411 and loyalty discounts do not silently change.
- Payment once, payment retry, concurrent final gift, color/size/volume and matrix stock.
- Two simultaneous checkouts for one customer; campaign expiration mid-checkout; refunded order policy.
- Internal vendor/branch shipping versus group external shipping; mobile layouts and accessibility.
- Admin submission alert exists; admin-only customer promotion; no customer broadcast from merchant.

**Current status:** Docs and read-only source contract tests only. No SQL to run yet. No live feature enabled.
