# Staff order-save sessions and direct price protection

## Concrete gap and scope

Production metadata confirms that orders still have broad API UPDATE grants and permissive RLS. Local independent totals/currency, paid transitions, payment types, external-shipping amounts and settlement markers already have enabled guards. Those protections remain unchanged.

Global product-link order totals/currency were still saved with direct browser UPDATE. A caller did not need a staff session to attempt this price edit. No production mutation or exploit was performed. The existing insert gate already restricts browser-created global link requests to a zero-price initial state; this change addresses subsequent price edits.

This stage adds one session-verified staff save RPC and migrates the four save handlers (admin/employee original panels and the two external-shipping overrides). The separate final trigger denies changes to total_price/currency made directly as anon/authenticated. Dedicated paid, payment-type and external-shipping RPCs retain their routes. Database owners and existing SECURITY DEFINER business operations retain their privileges.

## Authorization and compatibility

- Accept only admin/employee sessions, using the installed actor helper, including current role and enabled-state checks. Respect employee orders/pricing/branches permissions and their legacy aliases; absent permissions keep the existing UI defaults. JSON-string permissions are parsed; invalid JSON is rejected.
- Lock the order and compare expected status, price and currency. Concurrent quotes cannot silently overwrite each other while status remains unchanged.
- Accept only the fields the existing save controls send. Details may change only parcels_count; cart lines, finance/reward snapshots and stock evidence cannot be forged through the new RPC.
- Validate finite nonnegative edited amounts and the currencies supported by the existing controls. Keep null/zero quote behavior. Existing local-price triggers still reject local total/currency changes.
- Keep dedicated payment approval/type handling. The RPC cannot introduce paid status or change payment type. External shipping remains on its existing dedicated RPC.
- Validate selected branch/courier existence and courier branch/active state. The external-shipping override sends only delivery_agent_id, so derive its matching legacy courier_id server-side (including clearing it when UUID is cleared). Derive branch display name server-side.
- Preserve settlement locks explicitly inside the definer RPC for financial/assignment changes. Ordinary tracking/reference edits stay available.
- Log changed quotes with server-derived actor identity in a private RLS-enabled audit table, in the same transaction as the order write. No historical rows are rewritten.

## Validation

The isolated integration loads the deployed custom login/session definitions and actual production local-price/payment guards, obtains real synthetic admin/employee login sessions, and tests API-role denial, disabled/changed roles, expired/revoked sessions, permissions, stale quotes, malicious fields/details, nonfinite amounts, local immutable totals, settlement locks, existing payment/type RPC compatibility, audit failure rollback and final-trigger idempotence/rollback. It executes all four shipped save controllers against that isolated database. The minimal fixture retains a simplified JSON helper; it is not a restored copy of all production triggers/data.

Native PostgreSQL 17 additionally uses independent actual login sessions and connections to observe the row-lock wait of competing quotes and verify the stale second quote fails. Four Chromium button tests use the shipped controller code, synthetic DOM controls and mocked transport to check session routing, refresh and visible refusal feedback. The existing full E2E gate also runs. No credentials or customer/business rows are copied from production.

## Deployment

1. Backup branch: `backup/before-order-save-sessions-20261016` at main `38dc10e626fa18ef2e8107524065c28ad6a877a3`. User retains separate DB backup.
2. Execute `sql/kinto-order-save-session-v1.sql`. This creates the RPC, private audit table and unattached trigger function only. It changes no historical financial rows or existing guards.
3. Merge/deploy green PR; verify original panels and external-shipping shell load the migrated save handlers (shell cache version is advanced).
4. Execute `sql/kinto-order-price-lockdown-v1.sql`, then catalog-only `sql/kinto-order-price-verify-v1.sql`. No further merge is needed.
5. Emergency only: `sql/kinto-order-price-rollback-v1.sql` drops only the new API price trigger. Existing local/payment/settlement guards remain; audit/RPC remain so deployed clients continue to work.

## Explicit remaining boundaries

This is not an orders-table lockdown or full launch certification. Direct status/assignment/other-field writes and order reads/deletes remain governed by their existing controls and require the next scoped migration. This trigger protects the canonical total_price/currency columns, not every financial field embedded in details. The new RPC checks staff permissions, but other existing privileged RPCs retain their own authorization rules. Merchant finance and cross-store product/stock writes remain separate work. Payment-type/external-shipping calls and the ordinary save remain separate operations as in the current UI; this stage does not claim a single atomic transaction across those calls. No previous completed security stage is reopened or replaced.
