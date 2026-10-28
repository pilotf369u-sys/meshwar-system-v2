# PR #1113: isolated validation of vendor product-image RLS

Branch: `fix/vendor-storage-contentlength-rls-20261028`, starting at
`fb61963dd3b0b18e6fbb88b4250ccb6e8b25d900` (matches PR #1113).
No production Supabase connection, production SQL, merge, Hostinger deployment,
or PR #1114 change is part of this investigation.

## Cause and authorization contract

The original `private.vendor_media_upload_allowed_v1` requires
`metadata.size` to equal the ticket's byte size. Storage checks INSERT permission
before the final object metadata exists. Its upload precheck passes `mimetype`
and potentially `contentLength`, without `size`. Thus a valid ticket and active
store/session still fail the restrictive INSERT policy. This failure is reproduced
with the exact pre-PR predicate from commit `e7d9abcc` in the fixture.

The existing product and promotion upload functions pass a File to storage-js,
which builds FormData. The multipart HTTP body length includes fields and boundary
bytes, so replacing `size` with `contentLength` equality would also reject valid
images. The multi-image controller uses a raw image body. The loopback transport
test executes these three existing controllers and the real storage-js SDK:
it checks image bytes, MIME, generated ticket path, upsert=false, multipart
overhead, and propagation of a 403. Its HTTP receiver is a test double, not Storage.

The standalone SQL in PR #1113 permits missing `size`, still rejects a supplied
size that differs from the ticket, and preserves exact path, MIME, live ticket,
session/store association, session expiry/revocation, and store-active checks.
It does not change UPDATE/DELETE guards or permissive policies. `contentLength`
cannot safely be treated as the final image size. Bucket/Storage limits must
enforce streaming upload limits; a ticket's 15MiB issuance limit alone does not
prove that actual uploaded bytes obey that limit.

Reference inspection (not evidence of the production service version):

- Supabase Storage source commit `b6a70fc7e7da00b5fbd5e194bb347dfe13cba793`,
  `src/storage/uploader.ts`: `upload` passes mimetype/contentLength to
  `prepareUpload`; `authorizeUpload` probes an INSERT; `completeUpload` checks
  caller permissions again with final object metadata. The request parser
  distinguishes multipart body length from file size.
- storage-js source commit `cc4911877ef43cfc514a8a1b902d2fadfed282fb`,
  `src/packages/StorageFileApi.ts`: Blob/File bodies become FormData.
- The executable wire test pins storage-js `2.118.0` in CI. The application's
  CDN dependency uses `@supabase/supabase-js@2`, so its deployed SDK version and
  the production Storage version have not been established here.

## Changes and repeatable checks

The PR's SQL implementation was not changed: no additional SQL defect was proven.
The previous test applied the repair after loading an already-repaired full schema,
which could hide a broken/no-op standalone migration. The updated integration
test restores the original predicate, reproduces RLS rejection for both API roles,
applies the standalone repair twice, and verifies acceptance and denial cases.
All writes use disposable synthetic schemas and data.

Install isolated tools outside the checkout:

```sh
npm install --prefix /workspace/kinto-media-test-tools --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8 pg@8.16.3 @supabase/storage-js@2.118.0
cd /workspace/meshwar-system-v2
KINTO_PGLITE_MODULE=/workspace/kinto-media-test-tools/node_modules/@electric-sql/pglite/dist/index.js node ci/vendor-media-session.integration.mjs
node --test ci/vendor-media-client.test.mjs
KINTO_STORAGE_JS_MODULE=/workspace/kinto-media-test-tools/node_modules/@supabase/storage-js/dist/index.mjs node --test ci/vendor-media-upload-wire.test.mjs
```

Native PostgreSQL mode requires a **new disposable local PostgreSQL 17 instance**
with database `kinto_test`; the runner creates `kinto_vendor_media_test` and will
refuse a non-loopback host or different input database name. Use synthetic local
credentials only:

```sh
KINTO_TEST_DATABASE_URL=postgresql://postgres:isolated-test-only@127.0.0.1:55433/kinto_test KINTO_PG_MODULE=/workspace/kinto-media-test-tools/node_modules/pg/lib/index.js node ci/vendor-media-session.integration.mjs
```

Results: 92 authorization checks passed in PGlite and PostgreSQL 17; the existing
client test passed; the new wire test passed with six local HTTP requests (success
and 403 for each controller). No skipped checks in these selected runs.

## Remaining release gate

Do not describe a returned public URL from a mocked receiver or an accepted SQL
INSERT as a successful image upload. Before declaring the fix fully validated,
run an actual image upload and public readback through a full isolated Supabase
Storage stack using representative policies/bucket configuration and service
version. Verify persisted file bytes/final metadata, wrong final size/MIME,
expired/revoked ticket/session, overwrite denial, and bucket size limits there.
That Storage end-to-end check was not performed. This report does not authorize
production access, applying SQL, merging, or deployment.
