# Session RPC verification — 2026-10-16

## Executed evidence
- Six replacement RPCs execute in isolated PostgreSQL with synthetic rows only. The workflow runs both PGlite 0.5.8 and native PostgreSQL 17 with pgcrypto.
- 64 authorization cases pass: missing/empty/invalid tokens, cross-session type, expired/revoked sessions, inactive employee, wrong/null role, valid admin/employee operations, and legacy denial after lockdown.
- Valid wrappers continue to operate after revoking legacy EXECUTE from PUBLIC/anon/authenticated. Reward balance changes from 100 to 102 for two valid adjustments only; both campaign review actors come from the admin session.
- The fixture contains production function definitions obtained by metadata-only queries, with no production records or session values. Tests use reduced tables with matching referenced columns. SHA-256 uses PostgreSQL's built-in sha256 through a digest compatibility shim; this is not a restored full production database and does not cover triggers, all constraints, PostgREST transport, or browser rendering.
- A JavaScript VM behavior test executes actual load/approve/reject functions, verifies all four session RPC names and token arguments, rejects missing local sessions, and asserts no caller-supplied admin ID.

## Callsite inventory
- Repository-wide JS/HTML search finds no caller of `adjust_customer_reward_balance` (old or new). No reward-adjustment screen was migrated or invented; reward display and delivery accrual paths remain unchanged. This is evidence about this repository only, not external clients or cached historical builds.
- `admin-featured-requests-v2.js`: list, merchant list, approve and reject now call session wrappers.
- `admin-featured-campaigns-v1-core-v15.js`: merchant list calls the session wrapper. Other campaign CRUD RPCs remain outside these five legacy signatures and need separate review.
- Cache versions changed on both CMS script references and the nested core loader so deployment fetches migrated code.

## Deployment status and remaining gates
No production SQL executed and PR remains unmerged. Deploy the additive session SQL before the new UI. Confirm real admin session list/approve/reject on staging, and check any external reward-adjustment consumers before separately applying legacy lockdown. Do not claim live closure until production migration, client deployment, lockdown, and read-only ACL verification are complete. Broad customer table permissions remain a separate unresolved risk.

## Reproduce
From repository root, install `@electric-sql/pglite@0.5.8` in a temporary prefix and set `KINTO_PGLITE_MODULE` to its `dist/index.js`, then run `node ci/sensitive-session-rpc.integration.mjs`. Run `node --test ci/sensitive-session-ui.test.mjs` and `python scripts/verify_kinto_acl_stage1.py`. The ACL workflow executes these tests on relevant changes, including a PostgreSQL 17 service with real pgcrypto.

## Extended integration verification
- Executes the actual UI load/approve/reject functions against the isolated database through an RPC adapter under the anon SQL role after legacy lockdown. Asserts approved/rejected database states and server-derived reviewer IDs. A revoked session leaves the third request pending and restores the action button.
- Checks all five locked legacy signatures for both anon and authenticated roles, plus successful session-based listing from both roles.
- This adapter tests the UI-to-SQL behavior; it does not emulate PostgREST HTTP or replace a full restored-database/browser staging test.
- GitHub checks for commit 0a3a74c: 7/7 passed, including E2E. The older employee-session-ui-v143 source-pattern test fails identically on parent 451967a (expects an obsolete legacyLogin text); login and session helper files are unchanged.
- Connected Supabase inventory contains production only and no development branches. No paid branch or project was created.
