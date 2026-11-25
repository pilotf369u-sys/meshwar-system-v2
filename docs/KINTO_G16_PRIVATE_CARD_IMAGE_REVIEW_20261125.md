# KINTO — G16 Private Card Image Integration Review (2026-11-25)

**STATUS: SOURCE-CODE ONLY. NOT EXECUTED IN SUPABASE, HOSTINGER OR A LIVE APP.**

## Artifacts prepared
- `sql/kinto-g16-card-assets-isolated-v1.review.sql` — additive metadata + private image bucket + one-time admin image OTP table, atomic OTP verification/commit RPC, employee-session-verified READ-only catalogue.
- `supabase/functions/kinto-card-images-v1/index.ts` — separate Edge endpoint; uses existing admin verified session and employee session RPC, sends image-edit OTP to KINTO security email, limits images to compressed WebP ≤200 KiB and dimensions ≤1200px; stores in private bucket and issues employee short-lived signed image URL (120s).
- `js/kinto-g16-card-api-v1.js` — isolated client adapter for image OTP and authorized employee card access. There is **no automatic invocation**.
- `tests/kinto-g16-card-api-v1.test.cjs` — planned adapter tests for input constraints and fail-closed behavior.
- `sql/kinto-g16-card-assets-isolated-v1.verify-readonly.sql` — read-only RLS/grants/storage check for separate deployment gate.
- `sql/kinto-g16-card-assets-isolated-v1.rollback.review.sql` — narrow rollback for new extension only, no G16 table or order changes. Media objects are intentionally retained until separately authorized cleanup.

## Security design
1. Existing G16 financial destination still changes only via the original `kinto-payment-security-g16` OTP flow; this extension must **never** replace that workflow.
2. This new OTP is only for image replacement/default selection. It binds the intended card method and default choice to the one-time challenge. Server generates the private object path; no user-supplied URL.
3. No direct `anon`/`authenticated` table writes. The image commit RPC is service-role-only and checks existing admin session and OTP atomically.
4. Image reads require employee verified session and eligible, enabled and destination-verified G16 manual method. All storage objects are private; return a short-lived signed URL.
5. An image containing PIN, CVV, full account/card number or sensitive details must be rejected or redacted in the final admin UI before production. The code currently only checks compressed WebP container, size and dimensions, **not** the visual content of the image.
6. Real `brand_logo_url` is already managed via site settings; payment card must call the existing settings flow at integration, never ship a hard-coded alternative.
7. **No sending of instructions or OTP from this branch occurs today**. No connection to real employee send, customer chat, WhatsApp or invoice. Those integrations require separately audited, authenticated service access.

## IMPORTANT REVIEW BLOCKERS
- No end-to-end security/OTP/storage test with a disposable project has been performed, and the user does not want a Supabase staging database. Production deploy is blocked until there is another safe approved verification method.
- Source-only WebP header validation is not full image decode/content scanning. A safe image pipeline should decode/reencode server-side or use a trusted image decoder; tests for malformed WebP and EXIF/metadata stripping are required.
- Concurrency and rate limits need integration tests, including simultaneous OTP submissions, card revocation between preview and send, and two admins changing default.
- Employee catalogue uses existing `employee_session_identity_v143`, which may update session last-seen (existing behavior); this RPC does not modify orders or inventory.
- Recipient-specific authorization and invoice amounts cannot be inferred from G16 card data alone. The *separate* payment instruction sender must resolve those from established approved order/invoice records. Do not launch until known.
- Browser, Android WebView, signed URL expiration, security email provider, empty bucket rollback, and all legacy payment regression tests must pass.
- Neither generated image mockups nor logo placeholders are actual approved bank art.

## Hard do-not-touch gates
**Do not merge, deploy, execute SQL, publish Supabase Edge Function or patch Hostinger until explicitly reviewed.** Preserve the working manual payment path and existing status `تم التسديد` and all stock, merchant, invoice, order, login and tracking operations.
