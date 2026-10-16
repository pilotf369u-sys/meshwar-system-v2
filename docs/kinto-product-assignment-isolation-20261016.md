# Product ownership and order assignment isolation

## Scope and existing work

Keep the merged courier UUID linkage, stock/variant limits, V47 paid-stock deduction, pricing calculations, customer checkout, invoices, vendor order status/shipping, and previous price/payment/settlement protections. Two isolated reproductions established the remaining gaps: broad direct product writes across stores, and direct assignment changes on orders without settlement markers. Production was inspected through catalogs only.

## Product writes

`kinto_vendor_product_write_session_v1` derives the active store through the existing vendor session, locks and filters the product by that store, accepts a field allowlist, and returns no foreign rows. Inserts derive the store server-side. Metadata, barcode, category, cost, options and stock writes use the same route. Existing options/updated_at/stock equality filters are retained, including a no-row result on a stale comparison. The adapter handles Supabase's columns/select/representation options and raw REST auxiliary writers. It is explicitly installed on the vendor Supabase client and selected REST helpers; it does not replace global window.fetch.

Public product reads remain available. Final SQL removes only direct table/column INSERT/UPDATE/DELETE permissions. Existing trusted checkout/stock functions remain untouched and retain owner access. Catalog inventory found only trigger-returning existing functions with static local_products mutation statements; those cannot be invoked as ordinary RPCs. Legacy customer reserveStock/createOrder code is not a supported checkout path (the installed local-order insert gate already disallows it); current cart checkout is the canonical session/independent-order route.

No new variant arithmetic is introduced. Existing compare-and-set protections are forwarded, not replaced by a cached write. The native product editor still builds the same complete payload and keeps its expected updated_at filter, with stock/options CAS added because V47 intentionally does not stamp updated_at. Redundant barcode/cost click guards defer to the complete writer when installed, avoiding a metadata write racing its snapshot; fallback helpers remain session-bound. No-op product writes return the existing row without issuing an UPDATE. Store-owned category IDs are checked when changed; historical category IDs are not rewritten. Server-generated updated_at replaces the supplied browser clock. Public SELECT/cost-field exposure is outside this write-only stage.

## Assignments

Branch single-row, barcode and bulk saves plus admin branch saves use a role/session-scoped operation. Branch identity comes from the token; admin can manage the selected branch. The operation locks selected orders in sorted ID order, compares the displayed status/courier/UUID/fee snapshot, derives courier name and UUID from its canonical row, validates active courier/branch match, and commits a bulk request atomically. Legacy unchanged assignments remain unchanged. Settled financial/assignment locks remain enforced; tracking-only changes stay possible.

The existing staff save and paid-approval definer RPCs are also assignment entry points. A shared private validator is added to both, respecting current employee orders/branches permissions and checking references/settlement locks. Paid-approval UUID-only assignments derive their legacy courier ID as the native external-shipping editor requires. Existing function bodies are retained through checked, idempotent insertion anchors; SQL aborts on unexpected definition drift. Existing payment permits, stock and amount checks remain intact. Branch payment-type changes still require the pre-existing dedicated staff/admin route; no new branch authority is granted.

The final invoker trigger denies direct API changes to branch/courier IDs, courier UUID and display names. Ordinary order status/details/other-field authorization remains governed by existing controls: this is assignment isolation, not an all-column orders lockdown or a claim of complete platform security.

## Verification and limits

The isolated integration loads deployed vendor/four-staff login definitions and existing payment/local-price/settlement guards, obtains real synthetic login sessions, and tests cross-store writes, API/column lockdown, CAS, bad references and fields, private session expiry/revocation, scoped assignment, stale snapshots, settled tracking, bulk rollback and the paid approval entry point. The shipped product transport and all four assignment handlers run against the isolated database. PostgreSQL 17 additionally uses independent vendor sessions/connections to force a row-lock race and preserve stock after a stale options write.

The existing full E2E suite exercises product creation/editing, metadata/stock preservation, category login, checkout and account flows. Its mock Supabase client honors the configured product transport, so actual native product saves reach the new RPC transport rather than bypassing it. The mock backend remains synthetic; the SQL integration supplies real database authorization tests. Minimal isolated schema fixtures are not a full restored production database. No production business rows were copied or changed.

## Rollout

Backup: `backup/before-product-assignment-isolation-20261016` at `6389d183d67005fb6eb202a60afe4a5c725ab73b`.

1. Run `sql/kinto-product-assignment-session-v1.sql` (one atomic transaction). Additive/session routing only; no API permissions revoked or new trigger attached.
2. Merge/deploy the green PR. Verify the vendor shell/frame helper and all branch assignment handlers are live before proceeding.
3. Run `sql/kinto-product-assignment-lockdown-v1.sql`, then catalog-only verify SQL. No additional merge.
4. Emergency rollback drops only the new assignment trigger and restores the audited product API write grants. Session routes/validators and existing price/payment/settlement guards remain, so deployed clients continue working. No historical rows are rewritten.
