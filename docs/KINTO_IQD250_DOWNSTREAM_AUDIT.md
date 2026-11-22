# KINTO IQD 250 — downstream sales/campaign/invoice/label impact audit

**Status: review gate, NOT release approval.** Changes remain on draft PR #1171. No SQL, deployment, merge or production data change.

## Read-only verified dependency map (repository source)
| Surface | Authority and behavior | Risk from 250-IQD pricing | Action |
|---|---|---|---|
| Vendor cost/regular/discount | `js/vendor-barcode-margin-autopricing-v22.js` generates USD cents, manually edited base/discount saved separately | margin may be overwritten by PR #1169 | Coordinate both PRs; verify saved decimals survive refresh |
| Product card/detail | `js/local-store-pricing.js`, `js/local-store-product-details-v4.js` | must display identical unit price | Test $1, $1.16, $2; discount shown should match customer-facing prices |
| Extra index card/direct order path | `index.html` loads `js/local-store-enhancements.js`; its product-card click handler calls `placeOrder` and attempts direct `orders.insert` with MW- codes | **Potential alternate order path** bypasses canonical cart/session quote | Do NOT silently remove. Verify if UI reachable & server insert ACL rejects it; if reachable, audit separately before promotion |
| Cloud cart | `js/local-cart-v93.js` stores `unit_price_local`, but checkout sends IDs/options/quantity (not amount) | stale cart price vs updated server price; quantity totals, multi-store split | Validate cart refresh before checkout, price mismatch fail-closed |
| Manual checkout | `kinto_checkout_session_v1` -> V161 -> V101 -> base `checkout_independent_vendor_orders` | underlying base still rounds USD + IQD 1000 | Replace only exact pricing expressions after comparing live `pg_get_functiondef`; preserve function privileges and all nonprice logic |
| Electronic P5 quote | `private.kinto_payment_p5_quote_v1` source and live body | old rounder; coupon caps based on merchandise sum | Test quote amount, 10% cap, reserve, retries and payment attempt snapshots |
| Merchant DEALS gift | `private.kinto_deals_v1_gift_line_g5e` | original price + free gift discount must both use matching new amounts, net zero | Test gift amount and invoice display, stock once on paid |
| KINTO-funded campaign | V411 BEFORE INSERT stores discount separately, `least(reward_amount,product_total)`, does not mutate product subtotal | smaller product total may cap old fixed campaign amount | Test threshold/discount cap, invoice grand, no negative goods |
| Loyalty and coupons | `sql/kinto-coupon-finance-v1.sql`, P5 coupon points and 10% cap | lower totals can newly invalidate 1000/3000/5000 point coupons | Test 10% cap, funding source, 0/over-limit coupons; do not change policy |
| Vendor finances | V161 `vendor_finance_snapshot`, coupon-finance v1 | gross, commission, net should derive final authoritative amount | Test 5% commission, rounding by financial snapshot; shipping excluded |
| Canonical invoices | `js/vendor-v94-multistore-orders.js`, staff/customer/admin views; `order_store_segments` | frozen line items and order total must agree; no separate invoice repricing | Test each role and discount/shipping combination |
| Labels/printing | `js/kinto-unified-shipping-label-v1.js`, vendor bridge and role dashboards | COD labels must read validated invoice, never repricing/overcollect | Keep code unchanged; run cases prepaid, COD full, goods-paid/delivery-COD, mixed currency, collector segment |
| Existing orders | Stored order snapshots | historic orders should stay unchanged (even though trial data), no mass rewriting required | No UPDATE of existing order prices |

## Findings requiring verification
1. Direct order path in `js/local-store-enhancements.js` **is present and invoked by the index page's card buttons**, not necessarily a successful DB write. Its reachability and ACL require an E2E check; do not assume either functional or blocked merely from source.
2. Current simple discount `discountPercent` computes a vendor-USD percentage. IQD rounding can change the true customer-facing percentage. Validate labels rather than falsely advertising an exact discount.
3. Existing `local_products` money columns are numeric(14,2) in live DB per owner read-only query. All seven current stores report target currency IQD; future USD stores should be guarded explicitly.
4. In `js/vendor-v94-multistore-orders.js`, merchandise rows come from `unit_price_local` / `line_total_local`; shipping label COD full depends on authorized invoice total. A missing invoice must remain 'غير مؤكد', not substitute parent order totals.
5. The last verified GitHub draft run (before this new audit/test commit) passed 14 workflows; a new CI run is required. Success of source contracts does **not** prove live DB SQL matches.

## Target regression matrix before SQL approval
- Base and discount values: 0.80, 1.00, 1.16, 2.00, 9.99 USD; each as quantity 1 and 3
- 5% platform commission, FX 1770, resulting IQD multiples of 250; no USD ceiling
- One local store and two local stores in the same cart, product options/stock
- Manual order, electronic P5 simulated quote/reserve/cancel/pay, retry/duplicate admission
- Admin campaign fixed-amount discount, vendor DEALS gift at zero, loyalty coupon 10%-cap
- Invoice views: customer/vendor/employee/admin/branch/courier; invoice merchandise total equals signed order price and printed label collection
- Label scenarios: COD full, prepaid (واصل), product paid/delivery COD, split collector, mixed currency, no verified invoice
- Product edit/save, margin percent session recovery (PR #1169), historic trial snapshots
- Revalidation of actual live definitions, source restore points and separate SQL backup/rollback before deployment

## Built test
`ci/kinto-iqd250-downstream-contract.test.cjs` exercises 250-IQD values through common label type paths without changing them; wired to V22 GitHub workflow. It is an isolated source-level regression, **not** a substitute for database-driven checkout E2E.

## Stop conditions
- Any price mismatch between checkout quote and product card/cart; any legacy direct order ACL concern; any new failing CI; any difference in manual/electronic/sale campaign totals.
- No merging, Hostinger publish, SQL migration, feature flag toggles or live database mutation before owner review and final test evidence.

## Final pre-release update (2026-11-22)
- PR #1169 **was merged** into `main` at `b845674e4bc6e64e19835742b60ef52067b3a5b4` (22 Nov 2026, 15:08 UTC). The same authenticated `KintoStoreControlV1.rpc` session transport is already present in the IQD250 branch; source inspected in both `main` and branch. **No unresolved PR1169 overlap at the inspected source revision**.
- Latest checked PR1171 commit `d34af2dee75c82850566f8113a143c77ec004b3d`: GitHub Actions **14/14 completed successfully** including end-to-end integration, vendor margin, campaigns and label regressions. This is pre-SQL testing, not live checkout verification.
- Generated guarded SQL matched **all 8 exact source substitutions once each** against the owner-exported 2026-11-22 live database definitions after normalizing CSV CRLF to LF: checkout base 3, P5 quote 3, gift 2. A PostgreSQL deployment/runtime check is still outstanding; no SQL was executed.
- `js/local-store-enhancements.js` legacy direct order handler exists in the index page. Repository `sql/kinto-local-order-insert-gate-v1.sql` is designed to reject browser direct inserts; **presence of a migration file does not prove the installed trigger**. Prior to any production SQL rollout, run read-only verification of `trg_kinto_local_order_insert_gate_v1` status and the checkout session access path. Do not modify access control as part of the 250-IQD pricing patch.
- Rollback: six live functions + owner + ACL manifest saved in `KINTO_SUPABASE_SIX_FUNCTIONS_VERIFIED_BACKUP_20261122.zip`; server rollback restores only three changed function bodies. Existing source rollback branches preserved independently for main and Hostinger.
- **Go/no-go:** no release if a direct path bypasses authoritative quote; no manual/electronic/campaign/label/invoice mismatch. User approval and supervised SQL execution required. 

## Live order-insertion gate evidence supplied by owner (2026-11-22)
- Read-only `pg_trigger` result confirms three enabled (`tgenabled='O'`) triggers on `public.orders`:
  - `trg_00_kinto_order_session_write_guard_v1` BEFORE INSERT OR UPDATE -> `private.kinto_order_session_write_guard_v1()`
  - `trg_kinto_local_order_insert_gate_v1` BEFORE INSERT -> `private.kinto_local_order_insert_gate_v1()`
  - `trg_kinto_payment_p4_order_insert_gate` BEFORE INSERT -> `private.kinto_payment_hold_gate_p4()`
- Read-only `pg_policies` confirms INSERT policies `kinto_order_session_insert_v1` (RESTRICTIVE to anon/authenticated) and `orders_insert_anon` (PERMISSIVE to anon). The restrictive policy still applies to the anon permissive policy.
- **Interpretation limit:** this confirms activation, not predicate/body identity or observed denial of a forged direct order. Review/test actual trigger body and role behavior before claiming a verified deny.
- Do not disable the active triggers or modify order creation security as part of pricing release.
