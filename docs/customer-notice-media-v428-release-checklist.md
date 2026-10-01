# V424–V428 deployment gate (PR #701)
This is an isolated customer administrative notice attachment feature. Do NOT run SQL or merge until all checks below are satisfied.

## Required migration order
V418 must already exist. Apply V425, V426, V428 in that order. V420 and V424 store-logo enrichment remain untouched.

## Edge functions
Deploy `customer-notice-media-v427` and `customer-notice-delete-v425` with JWT verification enabled using the project's standard public Supabase anon client; authorization is independently checked inside both functions using the session token and service role.
Set `NOTICE_ALLOWED_ORIGINS` to an explicit comma-separated list of the actual production/preview frontend origins. Keep `SUPABASE_SERVICE_ROLE_KEY` exclusively in Edge Function secrets. Never add public Storage access policies.

## Rollout
1. Apply migration and deploy functions in staging first.
2. Test still image >1440px auto-resize, animated GIF under 5MiB, invalid signature, oversize GIF, unauthorized admin and cross-customer read.
3. Verify send with and without image, store chips/logo, read count, delete with and without image, failed Storage removal and retry.
4. Inspect Storage for leaked objects after failed upload and deletion.
5. Confirm desktop and mobile, existing order/customer notifications and authentication.
6. Only then merge the UI. A merged static UI before Edge deployment will fail attachment actions.

## Known limitation to resolve before production approval
The upload is a two-step send-then-attach operation. If upload fails, the text notice remains sent and the admin sees a partial-failure message. This is intentional disclosure, not atomic send. A periodic Storage reconciliation job is still required to handle rare cleanup failures; the Edge Function logs the orphan path.
