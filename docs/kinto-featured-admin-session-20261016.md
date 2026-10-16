# Featured campaign administration session migration

Scope: the five campaign-management client operations (list, two save variants, toggle, delete) and all eight existing legacy overloads. No sale/order/payment/inventory logic is changed. Supabase production catalog only was read; no production function was invoked to mutate campaign data.

The legacy functions either accept a caller-supplied admin UUID or have no authorization. All eight were executable by anon/authenticated on 2026-10-16. Five additive wrappers derive the admin UUID from private.kinto_staff_actor_v1, which validates the existing session, current role and active state. Wrappers call the existing business functions as owner; old functions must remain defined after their public EXECUTE is revoked. New functions have fixed search paths and explicit grants.

Two actual client controllers migrated, including the older save fallback. Loader and host cache versions updated. Public active-campaign readers and Phase 2 moderation are unchanged. Inventory found no other literal browser callers of these legacy management functions.

## Manual deployment
1. Save a current database backup. Apply sql/kinto-featured-admin-session-v1.sql only. Requires staff session helper installed by PR 969.
2. Deploy the UI after green CI; use a real admin session to list, create an isolated test campaign, edit it, toggle it and remove that test campaign. Verify public campaign display remains correct. Avoid modifying customer campaigns for testing.
3. Only after this succeeds, apply sql/kinto-featured-admin-lockdown-v1.sql, which revokes all eight legacy overloads from PUBLIC/anon/authenticated and asserts effective API role denial transactionally. Repeat smoke checks.
4. Emergency sql/kinto-featured-admin-rollback-v1.sql restores the observed PUBLIC and API-role execute grants, reopening the old risk. Restore grants before reverting UI.

## Validation and limits
95 isolated authorization/business checks: invalid/empty/mixed-role tokens, expiry, revocation, current-role demotion/inactivity, no mutation on denied calls, all eight legacy ACLs, both API roles after lockdown, create/update/list/toggle/delete and existing date/store validation. Real pgcrypto admin login -> session wrapper -> logout -> reuse denial. Native PostgreSQL 17 and PGlite modes; synthetic reduced-schema fixtures, not production data. UI VM test executes actual controllers and verifies every management call sends the session token without an admin ID, with missing-session denial. Existing regression gates retained.

Not a full platform security closure: remaining site-settings/admin RPCs, Storage and operational table permissions remain separate launch work. Direct access to merchant_featured_slots must also be checked before claiming complete campaign write protection.
