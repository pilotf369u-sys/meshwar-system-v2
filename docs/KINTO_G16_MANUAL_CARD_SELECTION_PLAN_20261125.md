# KINTO — G16 manual-transfer cards: implementation gate

Status: **isolated preparation only; NOT deployed or linked to production UI**.

## Decision
- Administrator creates/edits cards, uploads each card image, verifies beneficiary and destination with the EXISTING security OTP, enables/disables cards, and marks one preferred/default card.
- Employee choosing either **full card transfer** or **goods now, delivery cash on arrival** can choose among *enabled and destination-verified* cards only; default preselected. Employee cannot type arbitrary destination details.
- **Full cash on delivery** does not offer or display a card.
- Employee previews the order number, correct invoice amount, payment instructions, and card image before opening WhatsApp or internal chat.
- Sending instructions must NOT change order status, mark an order paid, deduct stock, assign a vendor, or change invoices. The current 'تم التسديد' authorization/workflow remains untouched.

## Existing G16 facts
- `public.kinto_payment_methods_g16` has `method_type,label,provider,recipient_name,account_reference,instructions,is_enabled`, but no image URL or default flag in the original migration.
- `js/admin-payment-methods-g16.js` has OTP-challenged destination editing and admin list/enable controls.
- Do not replace these routines or make a new, insecure direct table-write path.
- G16 manual payment catalogue was originally admin-only, not integrated with checkout.

## Required before wiring UI
1. Read-only inventory of the live G16 table, current secure admin RPC, storage permissions and available role/session checks; no direct schema changes without review.
2. Add an isolated, server-authorized image upload and read path; constrain image type, file size, compression, and ownership. Store only an image object reference in the catalogue (not base64). Do not expose sensitive card data on images.
3. Add server-authorized selection from G16 methods for employees, with enabled/verified validation on the server at the point of sending, never just in JavaScript.
4. Securely persist a non-sensitive card reference/summary and the payment instructions sent per order, so future default-card changes do not rewrite historical instructions.
5. Amounts must be sourced from the existing approved invoice/order, never independently recomputed. Goods-now mode excludes delivery due on arrival; full transfer includes what the existing invoice defines as prepaid. No currency conversion.
6. Test three method choices, admin disabled/unverified cards, default switching, OTP, employee access restrictions, WebView/cache, WhatsApp/chat, and **no mutations** to payment status, stock, receipts, invoices, shipping labels, or merchant routing.
7. Prepare a separate integration PR with migrations and review/rollback scripts. Do not merge to `main`, `00-hostinger-release`, or deploy Supabase until all tests pass and the user approves.

## Staged implementation (2026-11-25)

- Phase 1 — isolated visual preview: `previews/kinto-manual-payment-card-isolated-v1.html`. Mock bank-card artwork and logo placeholder only; no Supabase, external request, production image, saving, or sending. Has all three modes and three independent copy controls. Preview wording uses the final approved customer reassurance text. Amounts and card data are explicitly synthetic.
- Phase 2 — admin image upload/default-card controls: independent UI and compression prepared; proposed additive SQL, OTP and private image Edge endpoint staged for security review only (not installed).
- Phase 3 — staff card selection and customer message dispatch: isolated employee preview/guard/message formatter prepared; card catalogue RPC staged but not installed; real approved-invoice retrieval and channel dispatch NOT IMPLEMENTED.
- Phase 4 — live integration/regression tests: NOT STARTED; hold all deployment.

## Phase 2 independent deliverables — 2026-11-25
- `js/kinto-card-image-prepare-v1.js`: validates JPEG/PNG/WebP image (source cap 5 MiB), downsizes to at most 1200 px, produces WebP at most 200 KiB. Client-side transformation only; no upload/storage. A visual design mockup is not a real bank card and must never be treated as proof of bank authorization.
- `previews/kinto-admin-card-image-isolated-v1.html`: opt-in local file selection, compressed image preview, demo default-card selector. No live API calls or persisted values.
- `js/kinto-manual-payment-message-v1.js`: pure message formatter. Requires an already approved invoice breakdown supplied by an authorized server before future live use. Uses the approved final reassurance text; clearly separates transfer amount and delivery due. It does not read or write production order data.
- `tests/kinto-manual-payment-isolated-v1.test.cjs`: proposed regression tests for images, three payment modes, decimal USD, and invalid inputs.
- Executed 11 in-isolate runtime assertions against these source modules: all passed; three modules passed JavaScript syntax checks. This is **not** a substitute for browser, security, SQL, or end-to-end tests.
- Proposed G16 image/default metadata, OTP-protected Edge upload, and employee read-only RPC now exist as **review-only new files**; nothing is installed. WhatsApp/chat integration, authoritative invoice lookup and real admin-site logo integration remain NOT IMPLEMENTED. Do not deploy or merge.

## Current branch deliverable
`js/kinto-manual-card-policy-v1.js` is a pure policy helper for local previews only and is NOT a trusted authorization control. `tests/kinto-manual-card-policy-v1.test.cjs` exercises the policy.
