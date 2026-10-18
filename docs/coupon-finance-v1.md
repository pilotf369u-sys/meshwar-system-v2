# Coupon collection and vendor commission

Merchant-funded coupons reduce the goods amount used for commission. Platform-funded coupons reduce customer payment while the platform bears their cost. Shipping charges, payment modes, original prices, stock, sessions, coupon issuance/redemption and the order lifecycle retain their existing behavior.

| Goods | Merchant coupon | KINTO coupon | Customer goods due | Commission base | 10% commission | Merchant net |
|---:|---:|---:|---:|---:|---:|---:|
| 46,000 | 3,000 | 0 | 43,000 | 43,000 | 4,300 | 38,700 |
| 46,000 | 0 | 3,000 | 43,000 | 46,000 | 4,600 | 41,400 |
| 46,000 | 1,000 | 2,000 | 43,000 | 45,000 | 4,500 | 40,500 |
| 46,000 | 0 | 0 | 46,000 | 46,000 | 4,600 | 41,400 |

Other authorized deductions subtract from the merchant net. Full COD collection adds the existing shipping fees to customer goods due; prepaid and delivery-only COD retain their existing rules. This patch handles reward/coupon fields; campaign discounts have separate contracts and are not repriced here.

## Apply

1. Run `sql/kinto-coupon-finance-v1.sql` in Supabase SQL Editor. The transaction backs up installed settlement RPC definitions and affected existing pending finance snapshots in a private table, then attaches narrowly scoped finance triggers. RPC patching aborts atomically if the expected price operands have changed.
2. Merge/deploy the UI changes. `sql/kinto-coupon-finance-verify-v1.sql` is read-only verification.
3. For KN-000117, if still pending/unarchived and without other deductions, expect goods 46,000, merchant coupon 3,000, commission base 43,000, commission 4,300 and merchant net 38,700.

Only V161 snapshots with a matching store and currency and a V310/V401 funding snapshot are repriced. Unknown legacy reward funding is not charged to merchants. Paid and archived settlements are excluded from backfill. Historical collection receipts remain untouched. An existing pending collection claim created using the old amount must be rejected and requested again through the normal UI; approval fails on a mismatch instead of silently altering the claim.

`gross_amount` in V161 vendor finance is now the commission basis; `original_goods_amount`, funding shares and `customer_goods_amount` provide the explicit breakdown. Customer/vendor invoices keep their existing original-price and discount presentation. Legacy details synchronization must not overwrite a corrected finance snapshot or its authorized deductions/status.

## Rollback

Revert the UI deployment and run `sql/kinto-coupon-finance-rollback-v1.sql`. It restores the backed-up functions and backfilled snapshots only if they have not changed since installation; otherwise it aborts for review. New financial activity after installation is not erased. Keep the database backup as an additional recovery point.

## Validation

The settlement integration suite runs on PGlite and PostgreSQL 17 in CI. It includes the deployed settlement RPC definitions, real hashed admin/branch sessions, the existing V161 details-sync trigger and admin finance save RPC. It tests merchant/KINTO/mixed funding, no coupon, currency/store isolation, other deductions, paid/archive preservation, new and updated coupon snapshots, repeat installation, exact collection/receipts, stale claim refusal and guarded rollback. Browser tests execute the shipped collection controllers and finance calculations and load the complete employee shell on desktop/mobile with and without a coupon. Existing pricing, order privacy, assignment, stock and loyalty workflow suites remain required.

Local validation on 2026-10-18: 95 Chromium tests passed; 28 coupon finance checks plus 136 existing settlement checks passed on isolated PGlite; 102 product/assignment, 100 order privacy, 33 store control, 49 control-surface and 13 real V310 workflow checks passed. PostgreSQL 17 results are reported by CI, not inferred from PGlite. No production SQL was executed during preparation.
