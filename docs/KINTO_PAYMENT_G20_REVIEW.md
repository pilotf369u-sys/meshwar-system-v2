# KINTO payment G20-A review handoff

## Scope delivered

G20-A adds a customer-facing **مراجعة الطلب والدفع** step to the existing cart checkout button on `dashboard.html` and `store.html`. It reads selected rows from the cloud cart, sends only store/product IDs, quantities and selected options, then requests prices and coupon eligibility from `kinto_payment_quote_g20`. The server quote includes product images, variants, per-store subtotal/discount/payable values and an explicit `shipping_included=false` marker. Prices shown in the browser cart are not submitted as authoritative values.

The review RPC creates a short-lived quote snapshot only. It does not reserve stock, consume coupons, create a payment intent, insert an order, advance an order to `تم التسديد`, or call the payment simulator. Electronic checkout remains disabled. The existing manual checkout remains available and is explicitly identified as the current manual route; coupons selected in the review are not applied by that legacy route.

The new listener intercepts only `#kintoLocalCartCheckout`. Direct KINTO Deals orders use their separate `kinto_deals_v1_direct_order_g20` path and remain outside the cart. The quote RPC accepts no deal/coupon override path.

## SQL boundary and dependency review

`supabase/migrations/20261018194000_kinto_payment_review_quote_g20.sql` is the first additive stage. It creates one RLS-protected quote table, one private option-validation helper and one customer-session-validated quote RPC. Its dependencies are existing V132 customer review sessions, V94 UUID parsing, V97 server pricing inputs, V310 loyalty settings/coupons, V401 campaign coupon scope and the existing matrix stock key helper.

The SQL does not replace or call the hosted `kinto_checkout_session_v1` RPC, whose definition is not present in this repository. It also does not modify V97/V161 order creation, the `customer_apply_coupon_v310` consumption/ledger path, the G18 payment tables/emergency controls, the V47 `تم التسديد` stock trigger, invoices, tracking, OTP or direct-deal functions. The quote response rejects mixed currencies for now because a single provider intent currently has one currency; this is an explicit current limitation to resolve before reservation/payment for mixed-currency carts.

Stock checks in a preview are a point-in-time check, not a hold. A later reservation stage must revalidate under ordered product-row locks, persist holds separately from physical stock, and handle expiry/capture reconciliation. A later finalizer must enter the existing guarded paid transition so the current trigger performs the one physical inventory deduction; it must not insert paid orders or update stock directly. Coupon IDs stored in this quote are a preview snapshot and must be locked/revalidated and consumed through an idempotent per-store path during reservation/finalization.

## Review and rollback

This migration has **not** been executed against production or Supabase. Local Supabase CLI, PostgreSQL and Docker are unavailable in the current workspace, so SQL runtime validation is still pending on an isolated Supabase project. No production SQL should be run from this handoff.

If G20-A is applied to an isolated project and needs rollback before later stages depend on it, the rollback order is:

```sql
begin;
drop function if exists public.kinto_payment_quote_g20(text,jsonb,jsonb);
drop function if exists private.kinto_payment_options_valid_g20(jsonb,jsonb);
drop table if exists public.kinto_payment_quotes_g20;
notify pgrst, 'reload schema';
commit;
```

This removes review snapshots and the quote endpoint. Once a later reservation or payment migration references these objects, roll those later stages back first. Production use requires a separate reviewed SQL presentation and explicit approval.

## Verification performed

- `node --check js/kinto-payment-review-g20.js`
- `npm run test:payments` — G18/G19 plus G20 review tests
- `git diff --check`

These checks cover cart payload minimization, store/campaign coupon scope, the checkout-only interception boundary and the migration's review-only/no-order/no-stock-write boundary. They do not replace running the SQL on an isolated Supabase project or browser end-to-end verification against customer data.
