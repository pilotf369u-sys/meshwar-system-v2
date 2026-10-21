# Private notice/campaign media Storage isolation

Scope: kinto-customer-notice-media and kinto-merchant-campaign-ads only. Both are already public=false, but existing permissive allow_all Storage policies grant anon/authenticated SELECT/INSERT/UPDATE/DELETE regardless of bucket. A private bucket flag alone does not close direct authenticated Storage endpoints when RLS allows access.

Four RESTRICTIVE policies deny direct API-role access to these two buckets, including SELECT/list/download/sign-new-URL, insert, update, delete and moves into/out of the protected buckets. Policies for all other buckets are retained. No bucket flags, files, metadata records, client code, Edge Functions, category data, product data, order/stock/payment logic or existing function grants are changed. Objects remain accessible through the existing authorized Edge routes.

## Production read-only evidence
On 2026-10-16 both buckets were private; service_role had BYPASSRLS and Storage object CRUD grants; related asset tables had no anon/authenticated CRUD grants. Retrieved actual deployed sources for all six notice/campaign media Edge Functions and verified createClient uses SUPABASE_SERVICE_ROLE_KEY without forwarding user Authorization as the Storage client credential. They retain their existing identity/recipient/draft/publication gates. Deployment versions/hashes are captured in ci/fixtures/private-media-deployment-audit-20261016.json; no runtime secret or object contents captured.

The existing customer notice path signs a 60-second URL after identity/recipient checks; campaign public image path gates the exact campaign publication state before streaming. Existing signed URLs keep their current TTL; this change does not revoke them retroactively. Broader SQL-RPC authorization remains separate audit work.

## Validation
82 isolated SQL checks with broad permissive policies enabled: both API roles denied direct read/insert/update/delete/upsert and cross-bucket moves; service_role CRUD remains available; six unrelated buckets retain existing behavior; pre-existing product restrictions remain effective; rollback restores baseline direct access.

Execute actual existing TypeScript handlers for public ad, admin preview, notice read and notice upload against the same isolated PostgreSQL Storage fixture: authorization gates mocked as allowed/denied, service-role Storage operations execute real SQL under RLS. Confirms authorized service access survives the policies and denied gates never reach Storage. This is reduced-schema/mocked RPC/HTTP transport verification, not a live Supabase end-to-end test and not proof of the unchanged authorization RPC bodies.

Run with ci/private-media-storage.integration.mjs in PGlite and native PostgreSQL17 modes. Existing notice/ad contract tests and browser regression suite retained. No production objects read or modified by tests.

## Manual application
This change needs no UI migration or additive RPC rollout. After green CI/review and current backup, apply sql/kinto-private-media-lockdown-v1.sql once. It preflights private bucket flags, RLS, service role bypass and effective CRUD grants and installs all four policies in one transaction. Failure rolls back all policy changes. Verify catalog guards afterward. Add actual notice image and published ad display to the agreed final consolidated smoke check; do not repeatedly recreate live notices/campaigns.

Emergency sql/kinto-private-media-rollback-v1.sql removes only these four guards and reopens the prior direct API access risk. It deletes no files or data. Category/chat/review and unused CMS buckets remain separate findings, not declared closed by this slice.
