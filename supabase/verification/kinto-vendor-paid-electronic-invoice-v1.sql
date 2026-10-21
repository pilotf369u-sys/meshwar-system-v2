-- Read-only checks for the scoped vendor legacy-P5 invoice projection.
select
  to_regprocedure('public.vendor_paid_electronic_invoice_orders_v1(text,uuid[])') is not null as function_exists,
  coalesce(has_function_privilege('anon','public.vendor_paid_electronic_invoice_orders_v1(text,uuid[])','EXECUTE'),false) as anon_can_call_scoped_rpc,
  coalesce(has_function_privilege('authenticated','public.vendor_paid_electronic_invoice_orders_v1(text,uuid[])','EXECUTE'),false) as authenticated_can_call_scoped_rpc,
  coalesce(has_table_privilege('anon','private.kinto_payments_p5','SELECT'),false) as anon_can_read_payment_ledger,
  coalesce(has_table_privilege('authenticated','private.kinto_payments_p5','SELECT'),false) as authenticated_can_read_payment_ledger;

-- Expected: true, true, true, false, false.
-- The function itself validates private.require_vendor_session and returns only
-- exact order IDs for the active store; no KP, customer, or other-store details.
