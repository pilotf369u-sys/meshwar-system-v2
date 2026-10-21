# Vendor product and promotion media tickets

Scope: product-images only, all three discovered browser upload paths. Product save/order/payment/stock/variant logic remains unchanged. Category-images has permissive write policies but no active uploader was found in the repository; it remains a separate finding, not silently closed. Other buckets are outside this slice.

## Findings and implementation
Existing broad Storage permissive policies permit anonymous insertion, replacement and deletion. Product main upload, older multi-image fallback and promotion logo/banner upload construct paths from a locally stored store ID. New public.vendor_create_media_upload_session_v1 verifies the existing vendor session and current store status/active state, requires the expected store to match, and generates a unique server path. Tickets bind the store, session hash, MIME and byte size for 15 minutes in a private RLS-protected table. No raw session token is stored there.

New images support JPEG/PNG/WebP/GIF/AVIF/BMP and up to 15MiB. SVG/video/unknown MIME/empty images are rejected explicitly. This is a new upload validation limit; historical files remain readable and are not modified. Main paths remain store-id/uuid.ext; promotion paths remain promotions/store-id/logo-or-banner-uuid.ext. Original paths and public URL shape remain compatible.

A separate lockdown adds three RESTRICTIVE policies scoped to product-images. INSERT requires an exact ticket with matching server Storage metadata mimetype/size, a still-active vendor session and store. UPDATE/DELETE and cross-bucket moves into product-images are denied to anon/authenticated. Unique names and upsert=false remain. Since public clients do not delete product files in the current repository, no deletion client migration is required. Service-role cleanup is unaffected. Tickets have no public table access; the boolean predicate is explicitly callable for Storage RLS only.

## Staged deployment
1. Current database backup. Apply sql/kinto-vendor-media-session-v1.sql only. This creates the private table and new functions; it does not constrain existing Storage clients yet. Uses production pgcrypto in extensions, not public.
2. Deploy client after green CI. Verify real vendor upload on a disposable unsaved product form (single/multiple images as available) and promotion logo/banner selection without submitting a promotion. Avoid saving fake products or sending fake customer orders. Three controller paths also have automated migration tests.
3. Apply sql/kinto-vendor-media-lockdown-v1.sql separately after migrated clients work. Record post-lockdown smoke status; do not infer that SQL fixtures constitute an actual Storage HTTP end-to-end test. Unknown external/historical clients must be considered before lockdown.
4. Emergency sql/kinto-vendor-media-rollback-v1.sql removes only the three guards, restoring old permissive behavior and reopening the risk. Restore policies before reverting UI. No object or product data is deleted by any migration.

## Verification and limits
64 isolated SQL checks: actual vendor bcrypt login, API roles, invalid/expired/revoked sessions, mismatched store identity, inactive store, invalid purpose/MIME/size, no tickets for denied calls, exact metadata matching, all path purposes, duplicate/overwrite/delete denial, ticket expiry, cross-bucket move denial, other bucket behavior unchanged, private ticket table denied, logout reuse rejection, rollback. Both PGlite and native PostgreSQL17 modes available.

Actual three uploader functions and shared client run in VM tests with mock transport: ticket before upload, server path used, no overwrite, missing/expired sessions and server rejection never fall back to anonymous upload. Tests use reduced synthetic schemas and metadata snapshots; no production sessions/passwords/objects were read or mutated. Actual Supabase Storage upload validation is still a deployment smoke check.

Previously completed site-admin batch: production legacy grants and scoped Hero guards were verified, and owner verified settings save/upload before lockdown. Owner declined repeat manual checks; post-lockdown real-UI smoke remains explicitly unperformed.
