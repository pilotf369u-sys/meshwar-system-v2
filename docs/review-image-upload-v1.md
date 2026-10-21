# Review image upload repair

At 2026-10-18 11:38:26 UTC, production PostgreSQL rejected a review-image INSERT under `kinto_remaining_asset_insert_v1`. A 14,216-byte WebP ticket had been issued but remained unused; the review text was saved and later published with no linked image. A second attempt hit `REVIEW_IMAGE_LIMIT_REACHED` because that unused capability counted toward the one-image limit.

Storage checks permission before final `metadata.size` is present. The previous helper required that final field even for the preflight check. The revised helper accepts missing final fields only for an existing, unexpired, unused ticket for the exact review path, where the review still belongs to that ticket's customer and allows uploads. Any supplied MIME type or final size must match. Finalization continues to require an actual persisted Storage object with the exact MIME type and byte count. The bucket's existing 50 KiB and image MIME limits remain in place.

A retry reuses a matching unused ticket when no object was saved. No bucket is opened and no Storage policy/ACL is removed. Finalization locks the review against moderation and refuses late attachment to a published review; an uploaded image still enters pending moderation.

## Installation

1. Run `sql/kinto-review-image-upload-v1.sql`. It saves the three installed function definitions in a private backup table and installs their replacements atomically. It does not modify review content, orders, products, customer balances, publication status or existing image rows.
2. Merge/deploy the accompanying frontend message/cache-version update. No Edge Function deployment is needed.
3. A newly submitted image should create a pending `product_review_images` row before the admin publishes it. The already-failed image was never stored and cannot be recovered automatically from the database. This patch does not silently change the published review or attach an unrelated image.

Rollback: `sql/kinto-review-image-upload-rollback-v1.sql` restores the original definitions if they still match this installer. New review/image data are preserved. Code recovery branch: `backup/before-review-image-upload-20261018`.

## Validation

`ci/review-media.integration.mjs` reproduces both original failures using deployed function definitions and the actual restrictive-policy expression. It tests real hashed customer sessions under anon/authenticated, missing/partial preflight metadata, strict final metadata, retry capability reuse, ownership, invalid/revoked sessions, expiry, replay, publication races, repeat installation and rollback on isolated PGlite and PostgreSQL 17 in CI. The browser test selects/compresses a real image, simulates a failed upload, preserves the selection and retries through the shipped submit/upload/finalize handlers.

Storage source reference: https://github.com/supabase/storage/blob/master/src/storage/uploader.ts (`authorizeUpload`, `prepareUpload`, `completeUpload`). No real production upload was performed during preparation.
