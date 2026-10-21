-- Operational rollback only: disables P5 admissions and restores the safe manual baseline.
-- This intentionally retains attempt/payment audit tables and P4 hold records.
-- Review the preconditions before running in any environment. Never run on production without explicit approval.
begin;
do $guard$
begin
  if exists(select 1 from private.kinto_stock_holds_p4 where status in ('active','reconciliation_required'))
     or exists(select 1 from private.kinto_payment_attempts_p4 where status='reconciliation_required')
     or exists(select 1 from private.kinto_payments_p5 where status in ('reserved','pending','unknown','reconciliation_required')) then
    raise exception 'P5_ROLLBACK_BLOCKED: reconcile or safely release every active/unknown attempt first';
  end if;
end;
$guard$;
update private.kinto_payment_runtime_p5 set simulator_enabled=false,real_collection_allowed=false,updated_at=clock_timestamp() where singleton;
update public.kinto_payment_providers_p2 set enabled=false,updated_at=clock_timestamp() where provider_key='kinto-simulator';
update public.kinto_payment_runtime_p2 set emergency_stop=true,emergency_actor='p5-rollback',emergency_reason='P5 disabled; manual checkout restored',
  emergency_changed_at=clock_timestamp(),selected_provider_key=null,updated_at=clock_timestamp() where singleton;
update public.kinto_payment_settings_g16 set payment_mode='manual',updated_at=clock_timestamp() where singleton;
update private.kinto_payment_runtime_p4 set effective_mode='manual',target_mode=null,transition_state='stable',electronic_admission_ready=false,
  updated_by='p5-rollback',updated_at=clock_timestamp() where singleton;
commit;
