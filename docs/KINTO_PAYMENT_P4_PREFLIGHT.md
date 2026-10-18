# Payment-P4 preflight — revised decision

This document updates the earlier PR #999 preflight after the approved single-effective-mode policy.

## Decision

The G21 stock trigger is **not required** if mode changes are serialized and fail closed:

- While manual mode is active, only manual local orders can be inserted or confirmed.
- A switch to electronic first closes local order intake, requires an administrator to attest that each unpaid manual order has no actual payment, cancels those orders through the normal `orders.status` transition (so existing coupon/reward/campaign lifecycle triggers run), and refuses to finish while an unpaid or unclassified local order remains.
- While electronic mode is active, manual order insertion and late manual payment confirmation are denied. This prevents an old manual order from consuming an electronic hold.
- A switch back to manual closes electronic admission. Unsent reservations can be released; pending or unknown outcomes keep their holds and block reopening manual intake until an administrator records provider evidence for `confirmed_no_charge` or a settled refund. A later success after a prior terminal result re-enters draining and blocks new orders again.

The reservation transaction and the existing stock-paid lifecycle serialize on the same product rows. Reservations never update `local_products`; V47/V93 remain the only physical stock deduction paths. This relies on draining the other order mode before changing the effective mode. It deliberately does not add the G21 stock trigger.

## Current-code findings

- G16's `payment_mode` is a saved preference; `effective_payment_mode` is currently hard-coded to `manual`.
- The current cart calls `kinto_checkout_session_v1`, which delegates to V161/V101/V97. The existing order insert contract is `source=local_cart_bundle` and `checkout_contract=independent_vendor_orders`.
- The stock lifecycle deducts only at `تم التسديد`; V47 and V93 lock products and apply physical total/variant/matrix deductions.
- V310/V401 and the deals lifecycle have cancellation effects. P4 cancellation must update the existing order status to `ملغي`, never delete the row or edit the coupon/reward tables directly.
- P2's emergency stop remains enabled and its live-collection path remains hard-locked. P4 does not expose checkout to customers or create paid orders.

## Transition safety boundary

The transition gate must serialize with order creation, payment confirmation, and provider outcomes. It takes a row lock on the P4 runtime record; local order insert and paid-transition guards take a compatible shared lock. A concurrent manual confirmation therefore either completes first and is preserved as paid, or waits and is rejected after the switch. A mode switch cannot commit with pending electronic attempts in `pending` or `reconciliation_required`. A failed notification alone cannot free a hold after an unknown or successful result; an authenticated admin must record a verified no-charge/refund reference, and that action is audited.

A human must verify external manual payment evidence before supplying the IDs to cancel. The database can verify order status and record the administrator attestation, but cannot independently inspect a bank transfer.

## Out of scope

- No G21 stock trigger.
- No `orders` creation from P4, no V47/V93 edits, no cart integration, no coupon reservation, and no actual gateway call.
- No SQL execution on Supabase. The SQL and rollback files in the execution PR are for review and isolated database testing only.

## Previous PR #999

The previous report correctly identified the race between active electronic holds and manual paid transitions, but its recommendation treated the G21 stock trigger as the only safe resolution. Under the approved serialized exclusive-mode transition, draining both modes makes that trigger unnecessary. PR #999 is updated to record this revised conclusion; the executable implementation is in the separate Payment-P4 PR. This implementation keeps `electronic_admission_ready=false` and P2's emergency stop authoritative, so it cannot admit checkout or real collection by itself.
