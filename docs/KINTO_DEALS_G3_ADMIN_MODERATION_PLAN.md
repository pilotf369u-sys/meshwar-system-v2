# KINTO DEALS G3 — Admin moderation implementation plan

Status: proposed technical handoff; follows approved #711/#712 contract and merged isolated G2 preview #710. No production activation in this PR.

## Approval state machine
- submitted -> pending_review, hidden and non-redeemable. New submission generates a distinct admin review event and independent pending counter.
- pending_review -> approved or rejected; only verified admin server-side can decide; rejection requires nonblank reason; record reviewer, timestamp, campaign revision, and idempotency key.
- approved before start -> approved_scheduled; becomes active only when start <= server time < end and feature flag, stock, ownership, pause, and moderation checks all pass. Approval is not automatic broadcast.
- rejected -> merchant sees reason and can edit/resubmit as a new review revision; material edit to approved deal requires re-review before revised terms become visible. Preserve prior confirmed order snapshots.
- admin may stop/unpublish; merchant may pause/retire under scoped rules. Never auto-approve pending requests on timeout.

## Data and security review before SQL
1. Inspect existing G1 five tables, columns, FKs, RLS and grants; avoid assuming approval columns already exist.
2. Inspect actual admin session verifier and vendor verifier signatures and notification schema. Do not trust client-supplied store_id or reviewer_id.
3. Design additive moderation revisions/decision log, server-only inbox RPC, pending count RPC, approve/reject RPC and vendor decision notification. Keep browser table grants absent and RLS enabled; expose only narrow authenticated RPCs with verified role.
4. Race-proof one decision per pending revision; no stale approval after merchant edits; approval must not turn OFF feature flag ON.
5. Reuse existing customer-notice send flow only after a separate explicit admin broadcast action. Never send on approval alone.

## G3 UI acceptance
- ADMIN: separate campaign requests tab, visible unread/pending count, compact request cards, campaign art, store, summary, dates, eligible products, gift and terms; explicit approve/reject; rejection reason required.
- MERCHANT: campaigns list shows قيد المراجعة, مرفوضة + reason, تمت الموافقة — مجدولة, نشطة. Notify on admin decision; resubmit rejected revision without re-entering everything.
- MOBILE: count updates from server and is not mixed with customer notices or vendor notifications.

## Gate and rollback
- First: read-only SQL preflight and documented RPC signatures for Omar to inspect. Then isolated additive SQL with flag OFF, postflight, CI contracts and manual live acceptance. No checkout/stock/invoice modifications or real storefront activation in G3.
- Confirm admin/vendor auth, state transitions, RLS, duplicate clicks, stale revision, rejected resubmit, scheduled time boundary, and that customer broadcast does NOT happen on approval.
