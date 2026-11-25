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

## Current branch deliverable
`js/kinto-manual-card-policy-v1.js` is a pure policy helper for local previews only and is NOT a trusted authorization control. `tests/kinto-manual-card-policy-v1.test.cjs` exercises the policy.
