# KINTO DEALS G3 — Admin moderation implementation plan

Status: proposed technical handoff; follows approved #711/#712 contract and merged isolated G2 preview #710. No production activation in this PR.

## Approval state machine
- submitted -> pending_review, hidden and non-redeemable. New submission generates a distinct admin review event and independent pending counter.
- pending_review -> approved or rejected; only verified admin server-side can decide; rejection requires nonblank reason; record reviewer, timestamp, campaign revision, and idempotency key.
- approved before start -> approved_scheduled; becomes active only when start <= server time < end and feature flag, stock, ownership, pause, and moderation checks all pass. Approval is not automatic broadcast.
- rejected -> merchant sees reason and can edit/resubmit as a new review revision; material edit to approved deal requires re-review before revised terms become visible. Preserve prior confirmed order snapshots.
- admin may stop/unpublish; merchant may pause/retire under scoped rules. Never auto-approve pending requests on timeout.

## Confirmed G1 compatibility constraint
- Existing G1 submission review_state permits only pending / acknowledged / rejected, while campaign status permits draft / submitted / active / paused / expired / rejected / archived. It has no explicit approved_scheduled value, reviewer, rejection reason, or review revision. G3 MUST additively model these (or derive approved_scheduled from acknowledged approval + future starts_at) and MUST NOT write unsupported enum/check values. Use acknowledged as the G1 storage representation of an approved submission, with separate reviewer decision metadata. Derive approved_scheduled from acknowledged plus server time before starts_at; never write a nonexistent campaign status. User supplied G1 live constraint output confirms these allowed states; other preflight sections are still required.
- Existing admin verifier is called as private.require_admin_session_v147(text) in v405; vendor verifier is private.require_vendor_session(text) in v344. Confirm signatures and actual live schema via docs/KINTO_DEALS_G3_PREFLIGHT_READONLY.sql before drafting executable G3 migration.

## Live preflight result — constraints confirmed 2026-10-02
- Omar ran the read-only preflight. Live G1 constraints confirm campaign status is restricted to draft/submitted/active/paused/expired/rejected/archived; submission review_state is restricted to pending/acknowledged/rejected; campaign/product/submission FKs and same-store structural constraints are present as expected.
- Therefore G3 will treat existing submission acknowledged as the persisted approval decision for V1 and derive the merchant-facing label «تمت الموافقة — مجدولة» from acknowledged + starts_at in the future. It will NOT attempt to write a new unsupported approved_scheduled database value. Rejected remains rejected with an additive mandatory rejection reason/audit metadata.
- Still required from the preflight before executable SQL: session_functions and g1_permissions/flag outputs, so live admin/vendor verifier signatures and closed browser grants are verified rather than assumed.

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
