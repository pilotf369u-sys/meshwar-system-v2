# Launch control remediation — 2026-10-17

Status: prepared and tested in isolation; production activation is pending. This report supersedes a launch endorsement for the remaining surfaces below. It does not reopen the completed order, product ownership, stock, reward or settlement stages.

## Findings and matching controls

| Audited gap | Remediation | Activation requirement |
|---|---|---|
| Public local-store hash reads and direct account writes | Public view excludes password_hash; table AND column write/read grants removed; admin session controls account management | Session SQL, frontend, lockdown SQL |
| Vendor exchange, margin, expense and featured-request APIs trusted store IDs | Fixed allowlist dispatcher derives vendor store from existing hashed session and rejects foreign store IDs; original pricing delegates retained | Same |
| Global-store, content and review management trusted admin IDs | Same dispatcher derives verified admin identity; legacy API execution revoked from PUBLIC/anon/authenticated | Same |
| Category/currency direct mutations | Session RPCs enforce vendor ownership or admin role; legacy table/column mutations revoked | Same |
| Legacy agents and financial/customer rows | Unused agents API revoked; restrictive session/row policies for local orders, returns and financial settlement reads; scoped finance insert; financial summary retains caller RLS | Same |
| Broad remaining Storage writes | Restrictive policies intersect old permissive policies; existing review tickets required; unused CMS/category upload paths closed; chat uploads require session-bound ticket | Same |
| Public chat, parcel and delivery-proof files | Private chat bucket; database checks actor and actual message/order ownership before Edge signs exact paths for 15 minutes | Additive SQL, Edge deployment, frontend verification, lockdown SQL |

The inventory covered 95 public tables, their RLS/grants, 200 non-trigger public SECURITY DEFINER APIs callable by anon, Storage policies, and 158 frontend source files. Counts such as no-policy tables or SECURITY DEFINER advisor notices are not themselves proof of a vulnerability. The active merchant-slot view intentionally exposes a filtered public advertising projection while the underlying table has no public policies; this view is retained to preserve public ads. Maintenance-only search_path warnings and the standard Supabase Auth password setting are outside this targeted patch.

## Exact rollout order

1. Preserve the current database backup. Repository rollback base is `backup/before-store-control-20261017` at `82b12644fca7afb4ece87aa0bbd8e0fb1efb4f60`.
2. Owner executes **only** `sql/kinto-launch-controls-session-v1.sql` in SQL Editor. This additive transaction does not revoke legacy access or privatize the bucket.
3. Deploy `supabase/functions/kinto-attachment-access-v1/index.ts` to the named function with `verify_jwt=false`. The body validates KINTO custom sessions through the database before any signing. Service credentials remain server-side. Verify OPTIONS and invalid-session rejection before frontend rollout.
4. Merge the matching green PR and verify deployed HTML/JS cache versions, including both vendor frame and shell and all five attachment-consuming role pages.
5. Owner executes `sql/kinto-launch-controls-lockdown-v1.sql` as one transaction. This is the point when legacy access is removed and chat-attachments becomes private.
6. Read-only verification: effective old API/hash/write ACLs, restrictive policies, private bucket, and anonymous denial. Do not create or modify production orders, customers, stock or files for testing.

Do not merge the frontend before the new Edge endpoint is ready. Do not run lockdown before frontend deployment is confirmed. Component SQL files are implementation sources; use the combined launch files for rollout. Both combined files are tested twice for repeatability.

Emergency rollback: `sql/kinto-launch-controls-rollback-v1.sql` restores only this stage's audited grants/policies/public-bucket state; it leaves earlier order/product controls in place. It reopens the vulnerabilities and is for restoring availability while repairing a regression, not a completed secure state. No business rows are deleted or rewritten by these rollout/rollback scripts.

## Verification and limits

- Isolated PostgreSQL/PGlite: 33 store-control checks plus 49 surface checks, alongside 102 existing product/assignment and 84 privacy/cost checks. Sessions are issued by existing login functions using synthetic isolated accounts, not production credentials.
- Tests cover role/store isolation, table and column grants, original pricing delegates, hashed store creation, scoped CRUD, revoked/invalid sessions, attachment upload tickets, exact authorized-path signing, and combined installation/rollback.
- The review-storage intersection fixture uses a test predicate; it verifies restrictive-policy composition, not a new end-to-end review upload.
- 33 Node client/Edge contract tests pass. Full Chromium suite: 77 checks pass; targeted attachment tests rerun after the final resolver change.
- Production has not been exploited or used for business-write tests. Full native PostgreSQL 17 and browser CI must be green before rollout.
- Previously issued signed attachment URLs remain usable for up to 15 minutes. Fresh signing checks current session/account state. Canonical URLs stored in messages/order snapshots remain unchanged; only DOM display URLs become signed.
- This closes the listed audited paths after activation; it is not a claim of absolute security or a numerical security percentage.
