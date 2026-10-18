-- G16-only rollback. Run only before any later payment stage depends on these fields.
-- This removes the mode controls and audit history added by G16; it does not alter
-- payment methods, orders, checkout, stock, invoices, tracking, or OTP functions.
begin;

drop function if exists public.kinto_payment_mode_admin_g16(text,text,text,text,boolean);
drop table if exists public.kinto_payment_settings_audit_g16;

alter table public.kinto_payment_settings_g16
  drop column if exists gateway_environment,
  drop column if exists payment_mode;

commit;
