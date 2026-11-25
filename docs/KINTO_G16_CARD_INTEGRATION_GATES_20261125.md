# KINTO — Payment Card Implementation Gates (2026-11-25)

**State:** reviewed technical integration contract, NOT deployed. No runtime order/chat/admin files modified.

## Five isolated work stages

| Stage | Deliverables | Gate |
| --- | --- | --- |
| 1. Approved visual | Green/gold payment preview and final Arabic reassurance | Static preview; real unified admin logo still pending |
| 2. Card image preparation | Client-side image checks and 200-KiB WebP output, admin-local preview | Storage authorization and persistent card association pending |
| 3. Staff payment choice | Approved card selection and strict dispatch preflight; invoice-based message composer | Real employee role and invoice retrieval endpoint pending |
| 4. Secure persistence and channels | New additive, narrowly scoped admin card-image/default selection API; image object access for authorized recipient; instruction snapshot; WhatsApp/internal chat dispatch | Not implemented; requires audit and migration approval |
| 5. Test/deploy | Browser and Android WebView tests, audit of OTP, RLS/storage and regressions | Must be green before merge/deploy |

## Confirmed from the source code
- G16 has its own `kinto_payment_methods_g16` table and OTP-protected changes through `kinto-payment-security-g16`.
- Existing G16 table originally has no card image-object path or default-card field; maintain existing OTP verification for destination changes.
- The current admin catalogue may include gateway records; NEVER allow them for manual transfer.
- Employee and admin session mechanisms are distinct. A trusted server endpoint, not a browser Boolean flag, must establish staff identity and authorized invoice.
- Do not trust arbitrary `image_url`, user-provided card details, recipient phone, invoice totals, or client-submitted approval flags.

## Security-ready server contract — remaining work
1. **Admin update**: staff cannot create accounts. Admin sessions only; image assignment must refer to a validated, private image object owned by a G16 manual method. Never overwrite or weaken `kinto-payment-security-g16` OTP path.
2. **Image validation**: allow only decoded JPEG/PNG/WebP, validate file signature and dimensions server-side, block SVG/HTML/polyglots, strip metadata, validate compressed output and owner. Keep full PAN/CVV/PIN/expiry/OTP out of public media.
3. **Activation/default**: only OTP-verified and enabled manual methods appear to employees; one preferred default per active scope, changed by admin only. Disabled/revoked methods fail closed on every send.
4. **Invoice**: resolve order and existing authoritative invoice via employee session. No recalculation, currency conversion, new statuses, or asynchronous change to order. If invoice version is stale, require refresh.
5. **Send**: prepare an instruction card without changing payment state. WhatsApp deep link alone cannot attach an image automatically; share image separately or provide approved HTTPS view. Internal chat must use its existing authorized channel instead of direct writes.
6. **History**: snapshot non-sensitive send details and card identifier plus invoice version, without treating them as proof of receipt; respect later card revocation and avoid leaking old account data to unrelated users.
7. **Logo**: resolve the logo through the existing admin-managed site-brand source; never ship a hard-coded substitute.
8. **Rollback**: additive migration and own feature flag; failure keeps current manual workflows unchanged. No experimental Supabase branch. Only production deployment after reviewed migration and tests.

## Proof collected so far
- All new files only; no modification to current checkout, inventory, orders, auth, or payment UI.
- 11 local runtime assertions checked previously for image/message/card helpers.
- 16 additional direct runtime assertions against the isolated dispatch preflight passed.
- These pure-function checks do **not** prove real integration, end-to-end security, Supabase RLS, image upload, or successful merchant/employee workflow.

**HOLD:** Do not merge into `main` or `00-hostinger-release`; do not run SQL or deploy Edge Functions or Hostinger files until full integration and independent verification.

## Follow-up isolated batch — 2026-11-25
- Created `js/kinto-payment-instruction-snapshot-v1.js`: immutable instruction snapshot and duplicate request-ID conflict detection. **In memory only**, not a transactional server idempotency guarantee.
- Created `js/kinto-payment-brand-v1.js`: selects `brand_logo_url` from existing `get_site_settings` response shape; refuses insecure URLs and SVG. Must be verified in a browser because URL handling is not provided by the limited JS test isolate.
- Created `previews/kinto-employee-payment-instruction-isolated-v1.html`: employee preview of all 3 modes and both communication channels; uses synthetic invoices/cards and no network/send/order writes.
- Added unit test files for snapshot and logo. 10 of 11 direct in-isolate verification checks passed; the sole unchecked logo-positive case returned null because that test environment lacks a global `URL` constructor, not because production browser behavior was verified. Browser test remains required.
- No service function, card image storage, admin write, verified employee send, or WhatsApp API has been deployed.

## Latest safe isolation checks
- Added separate `kinto-payment-whatsapp-handoff-v1.js` and tests: validates the recipient, encodes message, and requires manual send inside WhatsApp. No image attachment claimed.
- Added separate `kinto-card-image-share-v1.js` and tests: accepts compressed WebP card image and invokes OS share sheet *only* when a future employee/customer UI explicitly calls it. Share sheet opening is not proof of delivery.
- Hardened instruction idempotency snapshot conflict detection to compare approved account name, account number, label and image object key; the card ID alone is not sufficient. Direct tests passed.
- **The proposed SQL draft is intentionally disabled** because static inspection found malformed PL/pgSQL. Neither the Edge endpoint nor image-saving integration may be deployed until a fresh script passes actual PostgreSQL tests and the user approves rollout. Previous isolated SQL review claims do not constitute deployment approval.
- No runtime UI files touched; no new deployment or merge.
