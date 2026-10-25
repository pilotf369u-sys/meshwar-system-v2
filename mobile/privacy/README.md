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

## Dependency findings applied to safety (25 October)

The approval fingerprint now includes column nullability/default/type modifiers, relation RLS flags, constraints, enabled trigger definitions, public/private function definitions and RLS policies. A column-only fingerprint would miss a changed deletion cascade or trigger implementation. `catalog-drift-check.sql` changes each category inside savepoints and confirms rejection/restoration without surviving modifications. This remains a drift gate, not approval of the full production schema, grant audit or concurrent-DDL protection.

Admin preflight now shows reason/count details inside its existing request card, with textContent rendering and no executor button. The UI distinguishes absence of detected links from verified full erasure. Browser tests assert one explicit preflight call and no executor call. Production remains disabled; financial retention and ownership-aware media/backup handling are still required.

## Review media erasure (source only, disabled by default)

`sql/kinto-privacy-media-v1.sql` adds a private queue, separate empty/disabled policy plus the base enabled/reviewed erasure policy, bounded leases, and exact owner/path checks. Its RPCs are granted only to service_role and additionally validate the existing admin session and a verified customer request. Browser roles cannot prepare, claim paths or acknowledge completion. Only the server worker may remove an exact product-review-images key. It never deletes a Storage row with SQL, empties a bucket, follows client-supplied URLs, or touches order/payment/stock records. Legacy database image bytes are removed through the observed image-payload FK cascade. Source paths are cleared from completed jobs.

The new guards freeze leased source image identity/deletion and review owner/deletion, and prevent cancellation after an irreversible media phase starts. They only affect an explicitly approved active erasure lease, never normal reviews when the module remains disabled. Job-row locks coordinate source changes with claims; bounded waits/deadlocks fail closed. Interrupted operations retry with a new lease; three attempts then hold for review. Deleted files cannot be recovered by rolling back this SQL.

Server source: `supabase/functions/kinto-privacy-media-v1/`. Runtime switch KINTO_PRIVACY_MEDIA_ENABLED must also be explicitly true, and server env supplies its existing service key; no key is stored here or sent to clients. Each invocation processes at most one item, requires explicit matching request confirmation, and returns account_deleted=false even when media removal succeeds. On remove/list/access failure the source image remains and the queue retries. Verification lists the exact directory/name through authenticated Storage with a bounded search; a generic404 is not accepted as proof. SDK contract references: https://supabase.com/docs/guides/storage/management/delete-objects and https://supabase.com/docs/guides/storage/debugging/error-codes .

The module covers attached review images only, not uncommitted upload-ticket files, support-chat attachments, shared notices, account erasure, transaction retention or backups. No actual Storage calls, Edge deployment or production enablement have been performed. Mock Storage tests do not establish real SDK/provider behavior. Enablement remains prohibited until the complete deletion scope and actual storage permissions/settings are reviewed and coordinated.

Rollback: stop/drain worker first, execute `kinto-privacy-media-rollback-v1.sql`, then base privacy rollback/frontend restoration. Retain queues for reconciliation. Added RPC rights/guards are removed and policy disabled; rollback cannot recreate already removed data.

The competing-transaction test holds a real PostgreSQL claim open, attempts a concurrent source mutation with a200ms lock timeout, then verifies the committed lease still blocks identity changes and another worker sees no claimable item. It cleans its synthetic image/jobs/policy and restores the request status; no Storage API is involved. Base erasure disablement also shuts the media check gate, preventing an independently enabled media policy from bypassing base rollback.

## Remaining evidence needed for complete account fulfillment

The owner catalog shows public.customer_portal_data(text) and public.customer_portal_data_v2(text), but their actual implementations are absent from this checkout. The secondary session table must not be ignored or assumed unused. The earlier dependency export also did not include storage.objects policies or the legacy profile mapping. `sql/kinto-privacy-session-media-contract-readonly-v1.sql` reads exactly eight named function definitions (or explicit missing markers), Storage policy definitions/roles and FK links touching profiles. It reads no customer/session/file/message/payment rows and executes no application functions. This closes a specific evidence gap before modifying session/account handling, rather than rebuilding the accepted app. Backup expiry/configuration is still not observable from this query.
