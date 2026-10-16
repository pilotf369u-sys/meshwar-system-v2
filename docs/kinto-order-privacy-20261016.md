# Order privacy and private product cost

This stage addresses the deployed anonymous orders SELECT/UPDATE policies and public product cost identified after PR981. The earlier product ownership, assignment, price, payment and settlement work stays in place. Backup: `backup/before-order-privacy-20261016`, main `5bad85da6744f2a1156ea81280df6d8a27652aa2`.

## Authorization

A dedicated Supabase client fetch transport attaches role/session headers only to this project's orders endpoint. The database verifies the existing hashed, non-revoked, unexpired session, current account status and employee order permissions. Client role, URL IDs and filters grant no authority. Restrictive policies intersect the existing permissive policies: customers see their own rows, branches their assigned rows, couriers their canonical assignment and branch, and authorized staff operational rows. No token means no rows. The verifier is read-only, so GET/HEAD transactions do not fail while updating last_seen_at. Account/session verification is computed once per statement; courier scope uses the verified actor snapshot rather than querying the courier per order.

An invoker trigger constrains direct updates to each role's needed fields and lifecycle. Customer identity, finances and routing cannot be overwritten through another column. Customer cancel/legacy approval/global quantity edits and courier tracking/proof remain scoped. Staff primary saves continue using the already installed narrow session RPCs; direct staff writes allow only parcel images, plus the retained admin legacy finance metadata allowlist. Existing stock, paid and settlement triggers continue to run.

Vendor orders and full products use session RPCs. Shared legacy bundles are projected on the server before returning data, and legacy status updates change only the verified store's status on the locked original row. Ordinary public product reads retain column SELECT, excluding cost_price. Existing public product clients already request explicit non-cost columns; vendor wildcard/cost editor reads use the scoped RPC. The existing local_products_catalog view was inspected: no cost field. No orders-backed view exposes order rows; direct order_store_segments SELECT is already revoked.

The active V161 checkout engine is unchanged behind a new customer-session wrapper that derives customer identity/name/phone. Its former public entry points are retired only at final activation, alongside unused legacy portal/financial-period RPCs. Repository callsite inspection confirmed that the cart uses V161, while the older portal and financial-period endpoints have no current frontend callers. The wrapper delegates existing pricing, store splitting and stock behavior, rather than reimplementing them.

## Refresh and rollout

Anonymous Realtime cannot establish these custom sessions. Customer/staff existing polling is retained; vendor, branch and courier have an explicit session-bound change watcher. It skips identical snapshots, hidden pages and active field editing, and refreshes only on a changed scoped result. Existing rendering functions remain in charge. Session headers were checked against the live Supabase CORS preflight (allowed).

1. Execute `sql/kinto-order-privacy-session-v1.sql` (atomic additive install, no RLS activation or privilege removal).
2. Merge/deploy the green frontend PR. Verify all updated hosts and assets are live.
3. Execute `sql/kinto-order-privacy-lockdown-v1.sql`. Catalog and anonymous read-only verification follows. No second merge.

`sql/kinto-order-privacy-rollback-v1.sql` drops only these three restrictive policies and this new invoker trigger, restores previous product reads and legacy API execute grants, and leaves earlier product-write/assignment/payment/price/settlement locks intact. No business rows are rewritten.

## Verification limits

The isolated SQL suite uses deployed auth definitions and real synthetic staff/vendor sessions plus hashed customer sessions. It verifies both anon/authenticated roles, read-only GET, role/row/field isolation, stale/revoked/expired sessions, disabled accounts, vendor bundle projection, private cost, retained staff saves and session checkout delegation. Checkout identity/ACL is checked with a synthetic delegate; the unchanged production checkout engine is not claimed to have run in this minimal fixture. Existing checkout/pricing/stock contracts and Chromium tests remain enabled.

The full browser suite is synthetic. Production checks are read-only catalogs and HTTP availability, not a claim to have placed a real production order or restored the full database. This stage is not a universal security guarantee.
