# G3A release handoff — manual SQL gate

The consolidated live G3 preflight supplied by Omar confirmed both verifier signatures, all five G1 RLS/no-browser-grant states, and merchant_deals_enabled=false.

## Exact scope of this migration
- Adds reviewer, rejection reason and revision metadata to the existing submission table, a private-to-browser review audit table, verified-admin inbox and atomic approve/reject RPC.
- Existing submission storage states remain pending / acknowledged (= approved) / rejected. No new campaign status is introduced; approved-scheduled is a derived UI label, not an SQL CHECK value.
- Approval after ends_at is rejected. Duplicate/stale decisions fail; rejection requires a reason.
- This G3A slice **does not** create merchant submission endpoint, merchant push notifications, live admin tab, customer broadcast or storefront activation. A later G3B/G3C PR must do so and verify actual session ownership. RPC response explicitly reports merchant_push_sent=false and customer_broadcast_sent=false.
- Feature flag remains OFF; do not test real submission or enable checkout/stock/invoice integrations.

## Owner sequence
1. Merge PR #713 only when every required GitHub check on its latest head is green and the SQL is reviewed. Keep a checkpoint branch from current main before merge.
2. Omar manually runs `supabase/migrations/20261002_kinto_deals_v1_g3a_admin_moderation_off.sql` in Supabase SQL Editor ONCE. If an error appears, stop and send the exact error; no speculative hotfixes.
3. Only after SQL success, run `docs/KINTO_DEALS_G3A_POSTFLIGHT_READONLY.sql`. All checks must return true. Do not send real admin decisions without a separately reviewed test plan.
4. Continue G3B merchant submissions/notification read feed, G3C actual admin UI, then G4 approved-only storefront. Never enable merchant_deals_enabled during these preparation steps.
