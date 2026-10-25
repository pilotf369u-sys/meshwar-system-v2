# Isolated privacy implementation — not deployed

Branch: `app/privacy-controls-20261025`; rollback branch: `rollback/before-privacy-controls-20261025`. Review target is the preparation branch (PR #1106), not main. Do not merge the stacked app history wholesale into main.

## Behavior

- A signed-in customer explicitly requests deletion, reads only their own request status and may cancel. This does not erase, disable or log out the account, or alter orders/payments.
- Existing verified admin sessions access a paged queue. Admin can record verification, hold a request and inspect relation counts. No delete button or automatic executor is provided.
- Before review submission/photos, an unchecked content-policy agreement is required and saved with a version. The new submit wrapper calls the existing delivered-order validation. Insert guards also protect older submit/image endpoints; deploy the new frontend with the additive SQL as one reviewed change, not the SQL alone.
- Customers can report content or its author, block their reviews and undo a block. A report never hides a review automatically. Admin sees reported content and can dismiss or hide it; orders and prices are not changed. Blocking affects authenticated review details, not global rating summaries.
- New tables have RLS and no direct anon/authenticated grants. All public RPCs validate the existing custom server session. No customer ID is accepted as proof of ownership, and session tokens remain in POST bodies.

## Deliberately unfinished production erasure

`kinto_deletion_execute_v1` is disabled: no approved policy row is installed. It only handles a verified fresh profile in a reviewed schema. Associated rows, unknown logical customer relations, legacy local_orders or schema drift hold erasure. Existing production accounts with transactions are **not covered**. Real JSON identity snapshots, messages, Storage, backups and retention rules require a separate complete inventory and operational approval. Do not describe receiving a deletion request as completed account deletion or mark Play readiness true.

The executor briefly locks customer_review_sessions exclusively (500 ms lock wait) to finish in-flight validation transactions. This operational cost is another reason it must remain disabled until reviewed. A schema signature is only a drift gate, not proof of a complete identity inventory.

## Tests

`bootstrap.sql` installs shipped review/session implementations into a disposable PostgreSQL 17 database with a minimal synthetic customer/order schema. `database-check.sql` tests consent, ownership, expired/revoked sessions, report/block isolation, admin checks, policy/drift locks, actual fresh-profile erasure and preservation of existing orders/function bodies. It is not a full production clone.

`browser-check.cjs` loads actual modified UI modules. All Supabase requests are intercepted and sent to a loopback-only SQL bridge; review/deletion/moderation writes use the isolated SQL. Eligibility read data is a synthetic fixture. No real order, payment, email or production database write occurs. `rollback-check.sql` verifies the new endpoints can be disabled while retaining queues and existing functions/orders.

Workflow: `.github/workflows/kinto-privacy-controls.yml`. Never deploy `test-server.py`, fixture pages or seed scripts. They require an explicitly disposable database and are not included in Android distribution assets.

## Deployment and rollback (future authorization required)

1. Review exact SQL against the full current schema and take the normal database backup; do not enable erasure policy.
2. Apply the additive migration and coordinated new JS/HTML after authorization. Existing cached pages without the new agreement cannot create reviews until refreshed, which is intentional policy enforcement.
3. Verify real test customer/admin navigation and read-only staff impersonation; no genuine customer writes.
4. To roll back: restore the old frontend, then run the rollback SQL. It removes only the new insert guards, disables new RPCs/erasure and retains audit/queues. It cannot restore erased profiles. The only executed erasure in this task is synthetic.
5. Publish accurate policy/deletion resources only after retention, support operations and completion commitments are approved. Test their real HTTPS availability and native online link afterwards.

## Dependency inspection after the owner exports

The first owner report supplied direct customer FKs only. `sql/kinto-privacy-dependencies-readonly-v1.sql` additionally reports all public/private FKs, user trigger definitions/functions scoped to customer data and FK descendants, and configuration of three known media buckets. It reads no customer/session/payment/object rows and calls no application RPCs. This is one-shot READ ONLY inspection with an 8-second statement limit, not installed polling. Owner runs it manually; no Supabase connection is used by the agent. The query and its no-change checks passed on disposable PostgreSQL17 (run40194620545). The fixture uses synthetic bucket settings; actual settings/triggers are not inferred from that result.
