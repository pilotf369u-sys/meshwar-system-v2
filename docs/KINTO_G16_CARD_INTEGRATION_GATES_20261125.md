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

## Verified six-way instruction matrix (isolated code only)
- New `tests/kinto-manual-payment-flow-matrix-v1.test.cjs` executes the **three payment modes × WhatsApp/internal chat** across the actual independent helpers: verified card selection → employee preflight → invoice-field-only message composition → immutable snapshot, with WhatsApp handoff where relevant.
- All nine assertions/cases passed using a JS runtime harness (6 channel/mode cases + disabled card + missing account name + changed account number).
- All values are explicitly synthetic. **Not** proof that chat, bank image upload, invoice read, or payment processing works in production.
- The user reaffirmed that only reading a previously approved final invoice amount is allowed. Existing invoice calculations, views, cart, customer page, and status `تم التسديد` are outside scope.
- Production SQL migration remains disabled. Without validated SQL and server integration, do not proceed with deployment.

## Latest execution — read-only invoice and isolation gate
- Created `js/kinto-invoice-readonly-v1.js` and its tests. This is a strict, frozen, fail-closed adapter for already-approved invoice amounts **without summing, subtracting, currency conversion, price, coupon or freight recalculation**. It makes no network calls and touches no existing invoice.
- Updated the standalone employee demo and six-mode/channel matrix to use that read-only adapter.
- Executed 14/14 direct JS assertions for authorized invoice snapshot extraction and the complete 3×2 dispatch preview matrix; no production calls.
- Added `scripts/kinto-g16-card-safety-gate-v1.cjs`: a stand-alone, read-only Git diff gate that allows *only* known isolated files, requires the unsafe SQL draft to remain disabled, and requires the Edge function security lock. Compared the current PR file list against its allowlist: all 33 changed paths allowed, none are production operational files. Full Node command execution in a cloned checkout is still required before treating the gate as green in CI.
- Added server-only lock `KINTO_G16_CARD_IMAGES_APPROVED` (default absent/disabled) to the draft Edge function, so accidental publication fails closed. This is **not** a deployment or approval.
- Production account-image storage remains blocked because the initial review-only SQL was unsafe; live employee chat and WhatsApp dispatch remain NOT implemented. Do not imply successful production feature delivery.

## 2026-11-26 — Unified isolated instruction assembly
- Added `js/kinto-manual-instruction-assembly-v1.js`, a **pure, non-network** orchestrator linking approved invoice snapshot → enabled verified card choice → employee preflight → approved Arabic message → immutable instruction snapshot. It never sends, edits invoices, updates customer pages, marks paid, or mutates stock.
- Explicit cross-checks: invoice order matches requested order, invoice version matches, card must remain approved, formatter amount must equal preflight amount.
- Added 8 unit tests for full transfer, goods-only transfer with shipping at door, full COD without a card, stale order/version, disabled cards, server provenance gate, USD cents and unsupported currency. 8/8 passed in an isolated JavaScript harness, not a database/browser E2E run.
- Updated `previews/kinto-employee-payment-instruction-isolated-v1.html` to use the unified assembly instead of duplicating preflight/formatter code; static JavaScript syntax verified and no network calls present in the inline demo.
- Updated the independent safety gate allowlist and checked every changed path against it; all 35 changed files matched isolated patterns. Production page files remain untouched.
- **Release BLOCKED:** proposed image SQL is intentionally disabled; no confirmed server invoice provider, media storage deployment, existing-chat dispatch or production tests. The new authorization booleans are demonstrative placeholders, not a security boundary, and MUST NOT be supplied from an untrusted browser.

## Scope clarification — owner decision
- Only the initially approved manual bank card instruction feature remains in scope.
- New customer discount requests, shipping estimates, delivery tariff suggestions, and changes to the customer UI have been explicitly abandoned.
- Read existing final invoice amounts only. No price recalculation, no customer workflow changes, no modifications to shipping, orders, stock, or payment status.

## 2026-11-26 — Main feature only, employee presentation finishing pass
- Focus remains strictly: admin-approved manual bank card → verified employee instruction preview → approved invoice amounts shown without reprice → explicit copy or manual communication. No customer-page changes, discount requests, or delivery-tariff feature.
- Employee preview has a more legible green/gold illustrative card with prominent **demo-only/non-payable** label; no real bank identity or downloadable card image.
- Three independent copy controls stay disabled under full cash-on-delivery. In goods-now/shipping-at-door mode, the read-only delivery amount is displayed separately using the already approved snapshot; it is not recalculated.
- Added static checks to forbid shipping arithmetic and ensure demonstration-only art. All 6 preview contract checks passed in a controlled JavaScript test harness.
- Important final blockers remain the independent live server trust boundary for invoice and card, private image storage/OTP, real chat integration and actual browser/SQL integration testing. The disabled SQL draft is not a migration and must not be executed.
