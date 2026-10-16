# Customer profile write boundary

Production catalog inspection on 2026-10-16 found RLS enabled on `customers`, an ALL/PUBLIC policy with `true` predicates, no non-internal triggers, and effective SELECT/INSERT/UPDATE/DELETE for both API roles. This is a direct table bypass independent of previously secured login, checkout and reward RPCs. No customer rows, passwords or session tokens were read during the audit, and no production write was attempted.

## Change

`customer_update_profile_session_v1(text,jsonb)` derives the target UUID from the existing private customer session validator. Only `address`, `state` and `secondary_phone` are accepted; arbitrary target IDs, password, wallet and reward fields are rejected. Missing fields preserve their existing values. The response contains only these profile fields and the server-derived UUID. The actual dashboard address and phone controllers use this RPC, retain delegated staff view mutation denial, and report errors without a direct table fallback.

The separate lockdown revokes direct UPDATE/DELETE, including column UPDATE grants, from PUBLIC/anon/authenticated and aborts if effective write privileges survive inherited grants. Existing SECURITY DEFINER account management remains available through its session checks. Existing policies, SELECT/INSERT, orders, products and storage are not changed.

## Deployment order

1. Run `sql/kinto-customer-profile-session-v1.sql` in Supabase SQL Editor. This is additive and compatible with the current frontend.
2. Merge/deploy the PR after its isolated database and client checks pass.
3. Apply `sql/kinto-customer-profile-lockdown-v1.sql`. The isolated tests exercise the real controller and deployed session/account function definitions after this revocation. Include address/secondary phone saving in the one consolidated final launch smoke check.

Verification query (catalog only):

```sql
select r.role,
 has_table_privilege(r.role,'public.customers','UPDATE') as direct_update,
 has_any_column_privilege(r.role,'public.customers','UPDATE') as column_update,
 has_table_privilege(r.role,'public.customers','DELETE') as direct_delete,
 has_function_privilege(r.role,'public.customer_update_profile_session_v1(text,jsonb)','EXECUTE') as profile_rpc
from (values ('anon'),('authenticated')) r(role);
```

Expected: three false write flags, true RPC execution for each role. `sql/kinto-customer-profile-rollback-v1.sql` restores the previous effective UPDATE/DELETE access in an emergency, reopening the direct write risk. The additive RPC can remain during rollback. Code backup: `backup/before-customer-profile-session-20261016`.

## Evidence and limits

The integration test uses isolated PostgreSQL with the production definitions of the customer login/session validator and admin account RPCs. Customer positive login uses the deployed legacy plain-password branch; admin account management uses real bcrypt. This does not certify every customer password format or live production login. Checks cover own profile updates, omitted fields, forbidden fields and types, missing/invalid/expired/revoked/deleted-customer sessions, API role direct write denials including a PUBLIC column grant, admin create/edit/delete after lockdown, idempotence and rollback. Client tests execute the actual dashboard controller functions, including failure and delegated staff paths.

This PR closes only the direct UPDATE/DELETE route after deployment. It does **not** certify launch readiness. Direct customer SELECT (including sensitive columns) and INSERT remain open and need a separately tested session-scoped migration. The catalog audit also found broad API access on local products and settlement tables, and public execution of the legacy `apply_order_reward_discount` RPC; their actual guards and active callers must be checked before any launch decision. Previously completed campaign/media/staff fixes are not reopened by this work.
