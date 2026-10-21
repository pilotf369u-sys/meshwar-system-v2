# Site settings and Hero/brand upload hardening

Scope is two administrative RPCs, their CMS/brand callers, and site-hero-media Storage writes only. Previous staff/campaign work is retained. No production content, objects, passwords or session values were read/modified; live inspection uses function definitions, grants and policies.

## Findings
save_site_settings(text,jsonb) and admin_create_hero_upload(uuid,text,text) trust caller admin IDs; both executable by anon/authenticated. Settings table has no direct API write grants; hero_upload_tokens has no API CRUD grants. The upload predicate checks an unexpired exact object name. Broad permissive storage allow_all policies bypass that predicate and permit object update/delete.

## Changes
Two additive wrappers validate the current active admin via private.kinto_staff_actor_v1 and derive the ID server-side, delegating unchanged business behavior. All four actual callsites (CMS save/upload, brand save/upload) migrate to session-only arguments. Brand loader cache versions refreshed. Public settings reading remains available.

Separate lockdown revokes two legacy RPCs and adds three RESTRICTIVE storage policies for anon/authenticated. INSERT requires an existing unexpired Hero ticket; UPDATE/DELETE cannot target site-hero-media, and UPDATE cannot move another bucket object into it. Other buckets evaluate true and retain their previous behavior. Existing unique path/upsert=false behavior is retained. Grants/policies for product/category/review media are not claimed fixed by this slice. Previously issued live tickets remain usable until their existing 15 minute expiry. This does not introduce session revocation binding for already-issued tickets or change MIME/size validation behavior.

## Manual deployment
1. Current database backup. Apply sql/kinto-site-admin-session-v1.sql only (depends on staff helper from PR969).
2. Deploy UI after CI. Verify actual admin can load/save unchanged site settings, upload a disposable Hero/brand image and obtain a URL. Do not change live hero/logo selections just for testing; retain original URLs. The upload itself need not be saved into live settings.
3. Apply sql/kinto-site-admin-lockdown-v1.sql only after smoke checks. Repeat unchanged-settings save and disposable upload after lockdown. Verify public homepage media remains visible.
4. sql/kinto-site-admin-rollback-v1.sql restores the captured two legacy API grants and removes only the three new guards, reopening prior risks. Restore before reverting UI. No object deletion or data restoration is performed.

## Verification
64 isolated checks on PGlite/PostgreSQL17: role/current-active-state/session expiry/revocation checks, actual bcrypt admin login/logout, no writes/tickets on rejected calls, existing JSON/MIME validation, derived ticket ownership, settings key preservation, old RPC denial, broad permissive policy bypass prevented, valid/expired/no-ticket inserts, object duplicate/overwrite/delete protection, cross-bucket move denial, other-bucket behavior preserved, and rollback.

Actual CMS inline JS and brand controller tests cover session transport, missing-session denial, unchanged unknown JSON keys, safe upload paths and upsert=false. Storage uses a reduced SQL fixture with production-equivalent predicates, not a full Storage service. Real deployed upload smoke checks are required; tests do not establish global Storage security.
