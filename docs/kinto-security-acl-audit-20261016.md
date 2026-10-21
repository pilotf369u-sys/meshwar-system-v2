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


## Follow-up: verified authorization defects (read-only audit, 2026-10-16)
The latest Supabase Security Advisors returned:
- 1 SECURITY DEFINER view error: `public.active_merchant_slots_view` ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)).
- 18 mutable function search paths ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)).
- 197 anonymous-executable SECURITY DEFINER functions (same set also executable by authenticated). This is a **review queue**, not proof all 197 are exploitable ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)).
- 78 tables with RLS and no policy: most intentionally private, **not necessarily defects**.
- Leaked-password protection not enabled for Supabase Auth (the project also has custom login flows).

**Two confirmed authorization design problems, based on live function definitions (no mutation/probe):**
1. `public.adjust_customer_reward_balance(p_customer_id,p_amount,p_currency,p_actor_id,p_note)` is `SECURITY DEFINER` and `anon` can execute it. It checks `private.v112_require_reward_actor(p_actor_id)`, which verifies that the **caller-supplied ID** belongs to an employee/admin role; it does **not** validate a signed or stored session token. Thus an ID is being treated as authority to alter reward balances. This is a high-priority integrity risk; actual exploitation was **not** attempted.
2. `public.admin_approve_featured_request(p_admin_id,...)` is `SECURITY DEFINER` and `anon` can execute it. It checks `public.meshwar_is_admin(p_admin_id)`, which tests whether the **caller-supplied ID** belongs to an active admin employee; it does **not** prove the caller owns that identity. The existing `js/admin-featured-requests-v2.js` directly invokes this legacy RPC. Do **not** revoke it without migrating all approval/rejection/list callers to session-verified equivalents.

Existing verified session checks are available:
- `private.require_admin_session_v147(p_session_token text)` returns a verified admin ID.
- `private.require_employee_session_v143(p_session_token text)` returns a verified employee ID.
These should be used in new dedicated RPCs that derive actor identity from a session token **server-side** and ignore untrusted client actor IDs. Migrate all call sites and regression-test before revoking legacy RPC EXECUTE.

**Do not run a live anonymous exploit test** against customer rewards, campaigns, or production orders. A restored isolated database is needed for negative tests.

### Correct rollout order (must be separate PRs from ACL Stage 1)
1. Inventory every direct browser call to the two identified legacy RPCs and their related list/reject operations.
2. Build session-verified RPC replacements, with server-side identity derivation, minimal result fields, idempotence and audit logs where relevant.
3. Switch the admin and employee UI to the new RPCs, including expiration/relogin behavior.
4. In an isolated restored DB, verify no-token, invalid-token, other-role, and other-store calls fail; valid role succeeds. Verify no finance/stock/checkout regression.
5. Revoke legacy anonymous EXECUTE **only after** all clients have migrated and a rollback path exists.
6. Then address direct anonymous table CRUD and password exposure in small table-specific slices.

The additional file `sql/kinto-authz-followup-readonly-20261016.sql` is read-only metadata inspection, not a production migration.
