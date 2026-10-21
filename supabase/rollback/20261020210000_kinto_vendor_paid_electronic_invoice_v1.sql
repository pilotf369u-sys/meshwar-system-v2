-- Roll back the additive vendor-only P5 invoice projection after reverting the
-- application code that calls it. This drops only the new read function.
begin;
drop function if exists public.vendor_paid_electronic_invoice_orders_v1(text,uuid[]);
notify pgrst,'reload schema';
commit;
