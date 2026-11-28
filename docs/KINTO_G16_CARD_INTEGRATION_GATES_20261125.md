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

## 2026-11-26 — More concrete, isolated employee card catalogue
- Added `sql/kinto-g16-employee-methods-readonly-v1.review.sql`: **one new function only**, reads from the existing G16 manual payment catalogue after checking the existing employee session and role, returns enabled and destination-verified bank methods. No new tables and no changes to existing G16 mutation functions, invoices, sale/cart, inventory, orders, or status. **Not applied to any database.**
- Added `tests/kinto-g16-employee-methods-readonly-v1.test.cjs`: 4 source-level contract tests (staff session, verified bank account, only read-only ops, no data permissions) passed in an isolated JS test harness. Actual PostgreSQL compile and permission simulation have **not** been run.
- Polished the standalone employee instruction preview with a clearly *demo-only* green/gold card, separate delivery-due display based on approved invoice snapshot, and three explicit copy buttons; 6 static contract checks passed.
- Revalidated allowlist against the entire current draft PR: 38 changed paths, all restricted to new isolated G16 files, no operational files modified.
- **Hard hold:** This read-only review RPC cannot be used until SQL syntax/permission tests, legitimate source of staff session and approved invoice data, safe bank-card imagery, and the deployment process have been explicitly reviewed. The separately disabled image SQL remains DO NOT RUN.

## 2026-11-27 — Owner-requested saved checkpoints and concrete backend progress
Protected rollback branches were created **before** the subsequent commits:
- `safety/20261127-before-g16-main` points to the unchanged `main` checkpoint.
- `safety/20261127-before-g16-hostinger` points to the unchanged production release branch checkpoint.
- `safety/20261127-before-g16-feature` preserves the original isolated PR #1178 feature head.
Do not edit or delete these three rollback branches; never use a force push for them.

NEW CONCRETE RESULT: `supabase/functions/kinto-g16-employee-manual-cards-read-v1/index.ts`
now serves the verified **G16 manual bank card catalogue without any new SQL migration**.
It uses the actual existing `employee_session_identity_v143` authorization, validates employee role,
then uses service-role *read-only* queries for existing `kinto_payment_methods_g16`
enabled, destination-verified manual rows. It does not access invoices, carts, orders, payment status, stock, or media storage. No data is exposed when its server-only release switch is off.
- `js/kinto-g16-verified-manual-cards-read-v1.js` adds a separate client adapter.
- Four client-adapter tests, four Edge source-contract tests and four mock runtime checks succeeded. The actual server code was exercised with mocked sessions/data, yielding 503 disabled, 403 wrong origin, 200 employee verified card and 403 wrong role.
- No production endpoint was deployed; server-only secrets/origin configuration were **not changed**.
- No real customer invoice is yet read by this new service; the invoice display remains a separate trusted-source integration requirement.
- Not yet complete: bank-card private image upload/OTP storage (the invalid draft SQL stays disabled), real approved invoice extraction and employee chat/WhatsApp attachment handoff, end-to-end tests. These must be individually validated before deployment; do not bypass user approval for live data changes.

## 2026-11-27 — Critical pre-send integrity gate added
- Created `js/kinto-g16-instruction-freshness-v1.js` and 7 passing unit tests. Immediately before an employee copies or manually hands off transfer instructions, the guard requires a **fresh server-approved invoice** from a future verified provider and a fresh verified G16 card catalogue, then compares invoice order, revision, currency, full/partial amount, shipping due, recipient, account, label and image reference against the original approved snapshot. Any change or missing authority fails closed.
- This helper is read-only and **does not send**; a browser can forge injected booleans or readers, so its existence does NOT satisfy the missing server-side invoice authorization requirement. Do not connect live send to untrusted UI flags.
- Removed the obsolete, unused `sql/kinto-g16-employee-methods-readonly-v1.review.sql` proposal and its test. The isolated `kinto-g16-employee-manual-cards-read-v1` Edge endpoint already retrieves approved G16 accounts with **zero additional SQL migration**. This removes one proposed database change.
- Remains BLOCKED: trustworthy current invoice quote from the actual approved invoice system including campaign/coupon and split-currency handling; secure private card image persistence with OTP (image SQL remains disabled); final browser and PostgreSQL integration tests. No production build, SQL, deploy, payment, invoice, or order changes performed.

## 2026-11-27 — Two no-SQL read-only server boundaries and send safety
- Implemented `supabase/functions/kinto-g16-employee-order-context-read-v1/index.ts`, an additional isolated **disabled-by-default** read-only endpoint. Verifies existing v143 employee session/role and reads only existing order ID, order code, customer ID, status, currency and payment mode. Only current approved/pre-payment order states pass. It returns `canSendInstructions:false`, `invoiceAmountAuthorized:false`, `invoiceRevisionAuthorized:false` even on success: **not a finance quote**.
- Four runtime tests with simulated Supabase responses passed (disabled=503, bad origin=403, eligible staff/order=200 without any amount, unauthorized role=403 and paid order=409). No production connection.
- Added `js/kinto-g16-instruction-freshness-v1.js`: a fail-closed *UI pre-send comparison* of original vs freshly obtained approved invoice revision/amount/shipping and current verified card account/name/image. Seven tests passed. It is **not** an authorization mechanism without an actual server-trusted final invoice reader.
- Removed the unused review SQL proposal for employee bank catalogue; the working read-only catalogue uses the existing G16 table through a separate server function and needs no SQL migration.
- Current branch diff continues to avoid all existing operational files. The saved rollback branches remain unchanged.
- **Release blocker remains:** KINTO's existing invoice formatter derives final display from several sources including campaign/coupon and sometimes mixed currencies; no authoritative precomputed invoice quote RPC was identified. Until that exists and is verified, do not enable sending instructions with monetary amounts. Never guess, silently recalculate, or accept browser-provided amounts as approved. Image storage OTP also remains disabled/unverified.

## 2026-11-27 — Opt-in employee implementation + real CI green
- New **server-side actual instruction endpoint** `supabase/functions/kinto-g16-employee-instructions-read-v1/index.ts` reads the currently approved order and its existing payment mode, verifies the real employee session via v143 and retrieves a currently enabled, OTP-verified manual destination from G16. No new SQL/table, no invoice/order write, no auto-chat-send. It returns safe-to-copy instructions with **NO numeric monetary amount**, since the platform has no verified canonical quote interface covering campaigns, coupon funding and split-currency shipping.
- New employee browser client and `js/kinto-g16-employee-panel-v1.js` expose the workflow through one **off-by-default** optional script appended to `employee-dashboard.html`. The script returns immediately unless `?kintoG16Preview=1` is present; even in preview mode, the server Edge functions remain disabled unless an owner-approved server-only flag and origin allowlist are configured. No existing employee function or order flow is wrapped/redefined.
- The panel shows actual verified order/card options only when the above server endpoints are available, allows explicit employee text copy, and creates a local green-gold bank destination WebP. It does not upload images, change order status, send chat/WhatsApp messages, or mark an order paid.
- Added dedicated `.github/workflows/kinto-g16-isolated-gate.yml` and exact byte-diff safety check: the employee HTML must equal the untouched `main` version plus only the one opt-in script-loader suffix. The independent Node test suite and this strict diff check **passed in GitHub Actions run 46036373749**, commit `23a36c7e811f352f5528d7d1b953a279e42d1c28`. Other workflows may have outstanding status; this is not a production E2E sign-off.
- Remaining **stop-ship**: numeric amount from server-authoritative customer-approved invoice including discounts/campaigns/shipping; full server integration in non-production environment; disabled release switches, real employee/account/customer validation and rollout approval. No merge, no publish, no DB migration.

## 2026-11-27 — Verified same-currency numeric quote with shipped V94 parity
The original no-amount interim mode has been superseded **for strictly supported invoices**.

- New shared, read-only server module `supabase/functions/_shared/kinto-g16-invoice-quote-v1.mjs` derives the current verified amount from the same persisted order operands used by existing shipped V94 invoice `globalTotals` and `paidGoodsInfo`. **No** existing invoice/pricing function was modified. It compares inputs to current order state on every invocation.
- Includes reward coupon and direct campaign deduction in supported same-currency full transfer / full cash at door; goods now/shipping at door supports coupon, but blocks direct campaigns pending explicit parity validation. Mixed shipping currency, mixed discount currency, unapproved/paid states, stock projection, missing total and invalid precision all fail closed.
- The new `kinto-g16-employee-instructions-read-v1` Edge function now selects the required current order finance operands, invokes shared `derive`, and includes verified IQD/USD amounts in instructions **only on an accepted same-currency quote**. It remains disabled by default.
- The isolated employee panel re-requests the verified invoice and G16 bank account **immediately before manual copy or local WebP export**. If revision, amount, customer-facing bank details or delivery portion differ, it invalidates the old instructions. No automatic sending or paid status change.
- The current row revision uses `updated_at` if available, else existing `created_at`, and monetary operands are independently rechecked before manual copy.
- `tests/kinto-g16-invoice-quote-v1.test.cjs` extracts functions from the **actual shipped** `js/kinto-bundle-ui-v93.js` to compare parity on IQD, USD cents, coupons, campaigns and mixed-currency rejection. Added anti-stale and server/client contract tests.
- **CI verified:** dedicated GitHub Actions run `46037256227` on commit `ec26823993398e5ac0fcf627ebc19841530f1680` reported **60 passed / 0 failed**, including the exact one-loader-only employee HTML diff gate. (Later PR commits should independently re-run CI.)
- This is **not** verification against production Supabase order fixtures; no live migration, function deployment, secrets change, SQL execution, or merge occurred. Release must stay blocked until isolated staging/integration tests compare real supported invoice cases, validate PGRST303 service-role behavior, and receive explicit production approval.

## 2026-11-27 — Integration contract and failure-mode verification
- Inspected **actual** `supabase/config.toml` and V143 employee session RPC. Three G16 Edge functions require explicit `verify_jwt = false` entries because the existing employee credential is a KINTO session token, not a Supabase Auth JWT. Added only those three function-specific config entries; the strict safety gate compares the preexisting config **byte-for-byte** with `main`. This does not deploy or enable any endpoint.
- The existing `employee_session_identity_v143` updates its own `last_seen_at` employee-session heartbeat. Therefore the new services are *read-only with respect to orders, invoices, bank methods and payment state*, not absolutely zero writes at the authentication layer. No session RPC implementation changed.
- The isolated instruction server distinguishes absent order or unverified card from PostgREST read failures; `PGRST303` on employee auth, order fetch, or card fetch fails closed. Test verifies denial and no account/amount exposure.
- Deterministic financial parity test compared **1,800 IQD + 1,200 USD** randomly generated same-currency orders across full transfer, goods paid/shipping at door and COD, against the existing shipped V94 computation. All 3,000 generated scenarios matched, but are synthetic, not proof of live DB parity.
- Confirmed G16 OTP migration defines `destination_verified_at`; source migrations define selected rewards, campaigns and shipping columns. Real Supabase installation/schema/runtime has NOT been queried.
- GitHub Actions run `46055475617` completed: **62 Node tests, 4 Chromium tests, 0 failures** (before adding the 1,200 USD property case). Separate current head rerun should be verified.
- **Important stop-ship:** user's database is production-only; do not repurpose it as staging. A production read/write probe or Edge deployment was intentionally NOT attempted. PGRST303 behavior in the actual Supabase project remains unverified, and existing invoice discounts/partial scenarios that are not explicitly supported remain blocked.

## Verified GitHub Actions result — 2026-11-27 19:17 UTC
- Run `46055617204` passed on commit `b6685daa391b2268761f96987ada643296ff4048`: **63 Node tests passing and 4 real headless Chromium UI tests passing**, zero failures.
- Finance property tests contain **1,800 IQD + 1,200 USD synthetic invoice parity fixtures**, all tested against the source functions extracted from shipped V94. These are scenarios inside test cases, not 3,000 separate Node test entries.
- Real Supabase access, deploy, PGRST303 recovery, bank account verification against active production rows and behavior for unsupported mixed-currency/complex campaign orders remain untested; **not approved for rollout**.
- User's explicit standing instruction not to use the production DB for staging remains in force. `main` and `00-hostinger-release` remain identical to their protected checkpoints at verification time.
