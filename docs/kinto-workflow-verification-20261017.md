# Live workflow rehearsal and delivery guard correction

The owner requested actual order/campaign/coupon and role workflow tests after the read-only security check. Supabase branching was unavailable on the current plan; no branch or charge was created. Tests used new synthetic accounts, store, products and orders inside a rolled-back transaction on the deployed database. APIs were invoked with the actual anon role and newly issued hashed sessions. No existing customer, product or order was used. Sequences can advance even though business rows roll back.

## Confirmed on deployed routines

- Admin, employee, customer, vendor, branch and courier login/session issuance.
- Admin store creation, vendor product creation and exchange rate setting.
- Customer checkout: two units priced by the server at 36,000 IQD; stock remains 20 until payment.
- Admin coupon grant and customer redemption: 1,000 IQD recorded separately from the product subtotal.
- Employee pricing-stage save, customer acceptance, employee payment approval: stock becomes 18; vendor receives its order.
- Vendor shipping settings and paid-order shipping update: fee 4,000 IQD; goods/coupon snapshots preserved.
- Vendor preparation status, employee parcel ticket, branch courier creation, employee branch assignment, branch courier assignment, courier scoped order read and proof ticket.
- Merchant gift campaign draft, submission, admin approval/publication, public feed and direct checkout; one zero-price gift; payment deducts one paid unit and one gift; confirmed redemption; second use denied by the customer limit.

## Actual failure and precise fix

The courier's direct status update to `تم التسليم` failed with `COURIER_ORDER_WRITE_DENIED`. The existing V310 BEFORE trigger computes `loyalty_points_earned` before the input authorization trigger, so the latter mistakes the server-generated value for client input. The isolated ACL fixture had not included the real loyalty trigger.

The patch moves input authorization first by renaming its trigger to `trg_00_kinto_order_session_write_guard_v1`. It preserves the function, role/session checks, grants, financial field allowlists and loyalty/stock algorithms. This also allows the existing automatic coupon restoration on a valid customer cancellation to run after input validation, while forged financial fields remain rejected.

To continue investigating the rest of the live journey, the rehearsal caught and recorded the courier failure, then used the existing authorized vendor delivery action. That separate action passed, including 360 loyalty points on 36,000 IQD goods, no second stock deduction, branch settlement request and admin approval. This is **not** reported as a successful courier delivery.

All synthetic business rows were checked absent after rollback. No real file upload, external notification/payment, or full browser journey against production was performed. The attachment checks exercised ticket issuance, not binary file retrieval.

## Validation and rollout

- Regression fixture imports the four actual deployed V310 routines, exercises earning and coupon issuance/restoration, reproduces the old courier error, applies the trigger-order fix twice, and checks duplicate earning and forged input denial.
- Shared isolated integration suite runs the regression on PGlite and PostgreSQL 17 in CI.
- Owner runs only `sql/kinto-order-workflow-trigger-order-v1.sql` after CI is green; this changes only trigger order and is compatible with the currently deployed frontend.
- Merge the PR to retain the corrected installer and regression tests.
- Then rerun `tests/sql/kinto-live-workflow-rollback-20261017.sql` through the authenticated database connector. This version requires the real courier action to succeed; it contains no vendor-delivery fallback. A failure aborts and rolls back fixture rows.

The backup branch before this correction is `backup/before-workflow-guard-20261017`, based on merged PR #983 (`7b0c0198a19ca5b09916aa938b03bcd3d84f6945`). Do not relax the write allowlist or grant direct access to loyalty fields to work around this error.
