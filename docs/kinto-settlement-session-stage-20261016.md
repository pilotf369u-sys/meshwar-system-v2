# Session-bound settlements and order settlement markers

## Confirmed scope

Catalog-only production inspection found open API writes on `settlements` and `delivery_settlements`, with financial values and actor identifiers assembled by browser code. Settlement creation and order marking were separate requests, permitting partial completion and duplicate claims. There were no public/private function definitions referencing either table, so no existing database settlement API required migration. No production financial records were read or mutated during preparation.

This change moves the active settlement operations into session-verified transactions, migrates all four caller pages, and stages direct table revocation plus an order settlement-marker guard. It does not change order creation, checkout pricing, stock, login or shipment status rules.

## Preserved calculations

These existing formulas differ and are intentionally retained. Amounts are recomputed from locked order rows; the new APIs accept IDs, not browser totals.

| Existing path | Gross | Fee | Net |
| --- | --- | --- | --- |
| Branch dashboard and admin branch report | Sum of door collection | Sum of delivery fees | Sum of door collection |
| Admin branches courier request | Sum of product totals | Sum of delivery fees | Product totals minus fees |
| Delivery report cash receipt | Sum of door collection | Sum of delivery fees | Sum of max(0, collection minus fee) per order |

Door collection remains zero for `paid_prepaid`, fee only for `product_paid_delivery_cod`, and product plus fee otherwise. Currency grouping and the existing `$` fallback remain unchanged; no currency conversion is introduced. Approval comparison tolerates at most 0.00000001 to accommodate JavaScript floating-point noise in existing pending rows; it never rewrites stored historical amounts.

## Server operations

- `kinto_request_settlements_session_v1`: admin/branch session verification, current branch/courier scope, delivered/unclaimed eligibility, sorted row locks, server totals, one record per currency and matching pending order markers in one transaction. Duplicate/missing/null order IDs and non-finite values are rejected. The legacy goods basis is admin-only and courier-only, matching its old caller.
- `kinto_decide_settlement_session_v1`: admin-only approval/rejection; lock the claim then its orders. Pending state, linked IDs, count, branch/courier/currency and recalculated amounts are checked before approval. Null/mismatching amounts fail closed. Rejection releases actual claims and marks the record rejected atomically. Approved/rejected records cannot be processed again. Inconsistent old pending records require rejection/recreation; they are not silently repaired.
- `kinto_cash_settle_courier_session_v1`: admin/branch cash receipts, current courier ownership, delivered/unsettled checks, row locks, per-currency receipt and `is_settled` updates in one transaction. The registered courier UUID supplies the required legacy `delivery_agent_id`. Missing UUIDs are rejected rather than invented.
- `kinto_settlements_directory_session_v1`: scoped admin/branch reads with allowlisted filters, date range, stable ordering, count and pagination. Branch scope comes from the verified session.

The two existing accounting workflows remain independent: claim records use `settlement_id/settlement_status`, while delivery cash receipts use `is_settled`. Duplicate protection is within each workflow; this PR does not merge their business meaning or deduplicate across those separate workflows.

## Schema and history

The additive SQL adds nullable `calculation_basis` to `settlements`. The deployed delivery table has required `settlement_code`, `delivery_agent_id`, canonical total fields and `orders_count`; its old adaptive browser insert omitted required values and used incompatible aliases. The RPC writes these real fields and adds nullable currency, order IDs, note and actor/name snapshot metadata. No old row is updated or backfilled.

Read projection maps the actual old total/count fields to UI aliases. Historical receipt currency stays unknown/null; it is not guessed. Historical courier mapping uses the registered courier UUID when a match exists; unmapped legacy identifiers remain visible rather than being assigned to a different courier.

## Frontend and final guard

`js/kinto-settlements-v1.js` reuses the existing host-role session helper. The branch dashboard, admin branches, admin branch reports and admin delivery reports send IDs/actions only. The adaptive direct insert and browser marker updates are removed. Existing settlement refresh uses scoped polling on actual changes, pauses while hidden and cleans up on page exit, since direct table Realtime reads will no longer have grants.

The final `SECURITY INVOKER` trigger preserves the API role as `current_user`. It rejects direct inserted/updated settlement markers, deletion of a settled/claimed order, and direct changes to its amount/currency/fee/payment type/assignment after a claim or cash settlement. Existing validated SECURITY DEFINER operations retain owner access. Ordinary tracking-only updates are not blocked by this guard. The trigger is created but not attached in the additive stage.

## Deployment order

1. Run `sql/kinto-settlement-session-v1.sql`. It adds columns/functions, without revoking old access, attaching a trigger or updating old rows.
2. Merge/deploy after all CI checks pass. Verify all four pages load `js/kinto-settlements-v1.js?v=20261016-v1`.
3. Run `sql/kinto-settlement-lockdown-v1.sql`: remove direct table and column privileges from PUBLIC/anon/authenticated, retain existing owner/service-role access, and attach the marker guard. Existing customer/staff/reward lockdowns are not changed.
4. Use `sql/kinto-settlement-verify-v1.sql` for catalog checks: both table ACLs false, four public RPCs executable, trigger enabled with `prosecdef=false`. Include a settlement UI check in the one consolidated launch smoke check.

Emergency `sql/kinto-settlement-rollback-v1.sql` removes only this trigger and restores the previously available browser CRUD privileges, subject to unchanged RLS policies. It reopens the original risk and leaves the additive functions/nullable metadata installed. Unused TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants are not restored. Code backup: `backup/before-settlement-sessions-20261016`.

## Evidence and limits

The isolated DB test uses deployed staff authentication definitions and real admin/branch bcrypt logins. It verifies current formulas (including prepaid/fee-only and decimal cases), mixed currencies, role/branch isolation, invalid/revoked/expired/disabled sessions, direct table/column/marker denial, decisions, unchanged history, rollback after an injected failure in a later currency group, and actual page controllers through the shipped helper against the database. Native PostgreSQL 17 additionally forces and observes row-lock waits for competing requests, cash receipts and approval/rejection, verifying only one winner and no duplicate receipt. PGlite does not stand in for those concurrency checks.

Client tests cover session/ID transport, directory filters, migrated callsite inventory and refresh lifecycle. Browser tests exercise the actual approval button and cash receipt button while denying direct table/marker writes. No live production settlement was created or approved.

This is not full order authorization or a launch-readiness claim. Other direct order permissions, mutable assignments/prices before settlement, merchant finance fields and privileged RPCs have separate boundaries. The new session scope checks use the current stored assignment; broader order-write authorization still needs completion. Previously closed customer/staff/reward routes are not reopened.
