# KINTO — G16 customer instruction send: source-based integration map

**Review-only; no live messages or order/invoice changes.**

## Existing facilities (observed in repository)
- `public.employee_chat_send_v61(p_session_token,p_customer_id,p_message,p_file_url)` authenticates the employee via `private.require_employee_session_v143`, and inserts into existing `public.messages`. It enforces 4,000 character message limit and ownership prefixes on chat attachments.
- `public.customer_chat_list_v61` and `public.customer_chat_send_v61` use the existing verified customer review session and established support conversation.
- Existing `js/admin-payment-methods-g16.js` customer preview explicitly warns customers not to rely on an account number supplied only through chat or WhatsApp. A new instruction must **not weaken this anti-phishing rule**.

## Required safe live behavior (not yet implemented)
1. Show the authoritative G16 card inside the *authenticated KINTO order screen*; allow the customer to verify the same account name/number there before using the instructions from WhatsApp/chat. Do not teach customers to trust arbitrary account details sent in messages.
2. Determine order status, customer ownership, approved invoice and approved monetary breakdown from the existing authoritative server flow, not browser parameters or marketing price fields. No independent recalculation.
3. Use `employee_chat_send_v61` only after the authenticated server preflight returns a signed/verified dispatch grant. Never send raw private storage object URLs, OTP, PIN or privileged session tokens.
4. Standard WhatsApp deep links can prefill text, not directly attach a bank-card image; provide an authenticated payment-card view or an explicit user-driven image share action. This is not an automatic silent image send.
5. If images were disabled in customer ↔ employee chat, retain that restriction. Prefer secure image rendering from the approved card catalogue, not new chat attachments that bypass existing restrictions.
6. Re-check card active/verified status immediately before dispatch, and use an atomic server request ID/idempotency record for any future send. Existing JavaScript duplicate detection is local preview only.
7. Sending instructions, receiving receipt screenshot or user clicking 'أرسلت التحويل' is **not** proof of payment. Existing employee `تم التسديد` action remains the sole established inventory/vendor handoff path.

## Integration blockers
- No verified mapping yet from order's approved invoice to `prepaidMinor`, `goodsMinor`, `deliveryDueMinor` across all three kinds of campaigns / local/global orders.
- No customer-authenticated, read-only order payment-card endpoint to confirm approved destination.
- No service-side atomic idempotent send+snapshot transaction for existing chat or WhatsApp. For WhatsApp the employee must finish sending explicitly outside the app.
- No browser or Android WebView E2E verification.

**Do not alter existing chat RPC, G16 admin code, order status, stock, invoices, checkout, or customer authentication.**

## Isolated hardening batch — 25 November 2026
- Duplicate request guard now compares the *actual approved account name, account number, card label, and image object key*, not just the card identifier. A changed destination under the same request ID fails closed instead of replaying a stale instruction. This is a preview-level check, **not** yet server transactional idempotency.
- Added `js/kinto-payment-whatsapp-handoff-v1.js` and matching tests. It validates an international customer phone and percent-encodes the full message for `wa.me` without navigating or sending. Requires the employee to press send; cannot auto-attach a bank image. No current dashboard integration.
- Direct source execution checks passed for the new handoff builder and changed-account duplicate rejection. These are unit-level checks only.
