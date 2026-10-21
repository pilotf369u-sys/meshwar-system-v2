# Employee order visibility incident — 2026-10-17

## Confirmed cause

Production PostgreSQL logs at 16:13 UTC (19:13 Istanbul, matching the screenshots) repeatedly report `ORDER_ACTOR_ROLE_INVALID`. The active employee account has a leading ASCII space in its stored Arabic role: ` موظف`. Login/UI and the staff-directory actor trim roles; `private.kinto_request_actor_v1` did not. A valid session therefore logged in but failed every protected order read. All 212 orders remain present. No session tokens or customer rows are included in this report.

PR #988 corrected calls to a removed rewards helper but did not fix this database rejection. A later sidebar override also replaced that counter implementation. The previous isolated controller test did not execute the complete shipped page.

## Correction and deployment

1. Run all of `sql/kinto-order-role-trim-v1.sql` in Supabase SQL Editor. It replaces only the existing actor function, using `lower(trim(...))` for the two allowlisted staff-role comparisons. It does not change business records, sessions, ACLs, RLS policies or financial logic. The original installer carries the same correction.
2. Merge this PR to remove the late counter override and stop exporting the rewards loader before its later script defines it. This preserves visible read-error markers instead of misleading zero counts.
3. Reload the employee page. Existing valid sessions remain valid; the next order request uses the corrected check.

Database rollback: `sql/kinto-order-role-trim-rollback-v1.sql` reverts only that role comparison. It intentionally reproduces the padded-role rejection. Code rollback: backup branch named in the PR.

## Verification

- Real SQL regression first restores the original comparison and reproduces the rejection for ` موظف`, then installs the standalone fix twice and proves order reads under both anon and authenticated with padded Arabic and English employee/admin labels.
- The same test proves wrong roles, disabled accounts, invalid sessions and denied order permissions remain denied; function ACLs remain identical.
- The shared database suite passes 102 product/assignment, 100 privacy/cost, 33 store control, 49 control-surface and 13 real workflow checks in PGlite; CI repeats on native PostgreSQL 17.
- Full-page Chromium tests load the actual external-shipping iframe with all shipped scripts and late overrides, at desktop and 393px mobile widths. They verify identity, order rows, counters, switching to all orders and reload. Backend responses are fixtures; these tests are not claimed as production-session browser tests.
- No production DDL or business writes were executed during diagnosis. The production fix still requires step 1 above.
