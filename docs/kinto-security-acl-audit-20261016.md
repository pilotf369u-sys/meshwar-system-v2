# KINTO Security: Production ACL review and Stage 1 least privilege (2026-10-16)

## Scope and safety
- Production metadata audited READ ONLY through Supabase. **No SQL changes applied to production.**
- The SQL in this PR is **manual deployment only** after approval, with explicit rollback.
- **Do not merge as a claim that KINTO is secure.** Stage 1 addresses only table-level TRUNCATE/TRIGGER/REFERENCES grants.
- No change to order/checkout/payment/stock/login/session/campaign business logic, JavaScript, or existing RLS policies.
- Backup checkpoint: `backup/kinto-price-security-2026-10-16` and user's separate DB backup.

## Verified findings (production, read-only)
1. RLS is enabled on `orders`, `customers`, `local_stores`, `local_products`, `employees`, `branches`, `couriers`, `local_orders`, `local_returns`.
2. Broad permissive policies (some `FOR ALL USING(true) WITH CHECK(true)`) combined with `anon` / `authenticated` SELECT/INSERT/UPDATE/DELETE grants remain. **This is a high-priority authorization/data-exposure risk, not fixed by this PR.**
3. The repository explicitly documents `supabase/local-stores-anon-policies.sql` as an **emergency permissive policy**, with a warning to replace it later. It grants broad anonymous CRUD.
4. `customers` has a `password` column and `local_stores` has `password_hash`. Broad table-level SELECT plus permissive RLS is an **exposure risk**, even if passwords are bcrypt hashes; no sensitive values were queried or copied.
5. The frontend is not uniformly RPC-only: `employee-dashboard.html` and `admin-dashboard.html` query `orders`/`customers` directly, `dashboard.html` updates `orders`/`customers` directly, `vendor-dashboard-v2.html` directly edits `local_products`, and `local-stores-admin.html` directly updates `local_stores`. Thus simply revoking CRUD or replacing RLS with `auth.uid()` checks would break production; these custom sessions are not necessarily Supabase Auth JWT identities.
6. The recent three local-price protection triggers remain enabled, as do existing payment/stock guards; they protect specific operations but **do not replace row authorization**.
7. Exactly **23 public tables** granted `anon` and `authenticated` all three of `TRUNCATE`, `TRIGGER`, and `REFERENCES`. Ordinary browser CRUD never needs these schema-level privileges. Stage 1 removes only these grants.

## Files and safe rollout
- `sql/kinto-public-acl-stage1-v1.sql`: narrow privilege revocation; transaction; postcondition assertions (rollback on error).
- `sql/kinto-public-acl-stage1-verify-v1.sql`: read-only zero-row verification plus remaining-risk visibility.
- `sql/kinto-public-acl-stage1-rollback-v1.sql`: exact ACL baseline restoration for the 23 scoped tables; emergency only.

## Required pre-merge / pre-production gates
1. GitHub CI green and human review of all 23 ACL entries. Verify no code relies on these DDL-level grants.
2. Verify the migration against a **restored isolated database** with the same schema, role grants and policies; run verification (expected zero rows). We have **not** run a restored-database integration test.
3. After approval, apply SQL manually on Supabase; verify no errors and zero-row result. Test guest storefront, customer login, vendor product CRUD, staff order flow, admin store edits, invoice and campaign screens.
4. Keep the rollback SQL accessible; **do not automatically execute**.
5. **Before public launch, separately migrate broad direct table CRUD to session-verified SECURITY DEFINER RPCs and then tighten RLS/grants in small slices.** Order: customers and credentials, employees/branches/couriers, orders, local_stores/local_products, then remaining tables. For each slice: migrate every client callsite, test multi-role isolation and negative unauthorized access, then revoke table CRUD. This is NOT implemented in Stage 1.

## Evidence of limitation
- Static and catalog audits are not penetration tests. We did not impersonate a real anonymous user or execute destructive probes against production.
- Current custom-role sessions and direct PostgREST CRUD create a compatibility dependency. Replacing RLS immediately would risk breaking sales/login/tracking.
