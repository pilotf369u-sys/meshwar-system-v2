# G5J payment-race acceptance protocol (staging/test data only)

Prerequisite: G5I 7/7 installation checks PASS. Keep production merchant_deals_enabled OFF. Never update a real customer order for this test. Do not run an UPDATE to a live order from SQL Editor.

1. Run `docs/KINTO_DEALS_G5J_PAYMENT_RACE_READONLY_PREFLIGHT.sql` in production: nine PASS checks, no writes.
2. In an isolated staging Supabase clone, create two distinct verified customer sessions and an admin-approved `buy_n` campaign with `max_total_redemptions=1`, one gift product with stock_quantity=1 and correct variant/matrix availability, and adequate paid qualifying stock. Turn the staging flag ON only.
3. Customer A creates a qualifying canonical checkout but does not pay. Verify A redemption pending, gift remains in the canonical order, stock stays 1.
4. Customer B creates an equivalent qualifying checkout. Verify B redemption pending and gift stock still 1. Both pending orders must be accepted: first-to-order does not win.
5. Staff confirms B's order as `تم التسديد` using the existing staff UI. Verify V93 deducted paid goods and gift exactly once, B redemption confirmed, campaign confirmed count 1, and B order cannot be customer-cancelled.
6. Staff attempts to confirm A's order. Expected: payment status update fails atomically; no additional product or gift stock deducted, A remains pending, and error is `DEALS_PAID_ALLOCATION_EXHAUSTED` / «نفد المنتج، حظ أوفر في حملات أخرى قريباً». Note: depending on stock check ordering, canonical V93 may reject insufficient gift stock first; that must also roll back the whole status update, and the staff UI should translate that case to the campaign-specific message.
7. Repeat with A/B simultaneous staff confirmations in separate staging sessions. Exactly one succeeds; the other fails or is safely retryable on lock contention. No negative stock or double-confirmation.
8. Repeat with no gift (`limited_purchase`), cancellation before payment, and ordinary non-campaign orders. Ordinary orders must retain their V93 behavior. Do not alter the customer cancellation restriction after payment.

IMPORTANT: The NOWAIT campaign lock avoids a campaign->product versus product->campaign deadlock; under contention it may produce SQLSTATE 55P03 (lock_not_available). The staff UI must surface a retry message, not claim the payment was completed. The G5I trigger cannot guarantee the friendly campaign message if V93 rejects gift stock before the AFTER trigger runs. This is a remaining UI integration acceptance requirement, not evidence of completed E2E.

Do not turn production flag ON based on static preflight alone.
