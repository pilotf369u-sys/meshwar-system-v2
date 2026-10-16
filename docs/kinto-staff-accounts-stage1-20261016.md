# Staff account directory — first launch-hardening slice

Scope: employees, branches, couriers only. Customers, orders, stores, Storage and remaining administrative RPCs remain separate launch blockers. This change does not claim launch readiness.

## Implemented
- Additive session-verified read-only directory. The server validates current actor role and active state, derives identity from the appropriate existing token table, scopes branch/courier results to their own account/branch, and excludes passwords and opaque branch payloads with explicit output allowlists.
- Employee lookup access follows existing orders/branches permission flags. Admin can list the staff directory; employee can read only their own employee row.
- All literal browser reads from these three tables in nine host pages moved to the directory. Removed unused legacy pre-login table/password lookup functions; the active six-role login flow is retained.
- Report/store-admin access verification uses the actual session identity and checks route ID agreement.
- Admin branch-page courier toggle delegates to the existing session RPC. Branch deletion uses a new admin-session RPC with an atomic linked-orders check. No order rows are changed.
- Existing courier realtime delivery cannot remain available after removing direct SELECT. The two subscribed management pages additionally compare directory snapshots every 10 seconds while visible; only changed data triggers rendering, and duplicate watchers are cleaned up. Order realtime remains unchanged in this slice.

## Deployment sequence — manual, owner controlled
1. Take a fresh database backup. Apply `sql/kinto-staff-directory-session-v1.sql` (additive RPCs only). Do not run lockdown yet.
2. Deploy the UI after CI and review. Test fresh admin/employee/branch/courier logins, staff lists, branch reports, delivery assignments and invoices, new/edit courier, toggle/delete courier, and linked/unlinked branch deletion.
3. Apply `sql/kinto-staff-accounts-lockdown-v1.sql` separately only after the clients work. It revokes direct table privileges from PUBLIC/anon/authenticated and rolls back automatically if table/column access remains.
4. Repeat the same smoke checks after lockdown. Existing SECURITY DEFINER session/account RPCs continue to operate as their trusted owner. Confirm no historical/external client relies on direct access before this step.
5. Emergency rollback is `sql/kinto-staff-accounts-rollback-v1.sql`; it restores the captured direct SELECT/INSERT/UPDATE/DELETE/MAINTAIN grants and reopens the prior risk. It does not alter data or policies. Do not roll the UI back after lockdown without first restoring those grants.

## Evidence and limits
- Live catalog read on 2026-10-16: these three tables had anon/authenticated arwdm grants; no trigger-based account protection. No production data/session tokens/password values read or changed by this work.
- Isolated tests use matching relevant table columns plus production metadata snapshots of session/login/account functions and synthetic records. They cover direct table denial, role/branch isolation, credential exclusion, invalid/revoked/expired sessions, role changes, filter/order injection rejection, linked branch protection, actual bcrypt logins and existing account writes after lockdown.
- Reduced-schema fixtures are not a full restored production database. Browser tests mock RPC transport; real Supabase browser smoke checks remain required before lockdown.
- Existing legacy administrative RPC authorization and the customer table are not declared closed by this slice. Removing staff table access alone cannot substitute for the remaining staged audit/fixes.
