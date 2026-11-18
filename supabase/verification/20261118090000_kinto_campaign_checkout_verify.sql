-- Read-only catalog checks after installing the campaign checkout migration.
begin read only;
do $verify$
declare
  reserve_oid regprocedure:='public.kinto_payment_p5_campaign_reserve_v1(text,text,uuid,jsonb,jsonb)'::regprocedure;
  finalize_oid regprocedure:='public.kinto_payment_p5_campaign_simulate_v1(text,uuid,text,uuid,jsonb)'::regprocedure;
begin
  if has_function_privilege('anon',reserve_oid,'EXECUTE')
     or has_function_privilege('authenticated',reserve_oid,'EXECUTE')
     or has_function_privilege('anon',finalize_oid,'EXECUTE')
     or has_function_privilege('authenticated',finalize_oid,'EXECUTE')
     or not has_function_privilege('service_role',reserve_oid,'EXECUTE')
     or not has_function_privilege('service_role',finalize_oid,'EXECUTE') then
    raise exception 'Campaign payment RPC grants differ from the service-only contract';
  end if;
  if not exists (
    select 1 from pg_trigger t where not t.tgisinternal and t.tgenabled in ('O','A')
      and t.tgrelid='public.orders'::regclass
      and t.tgfoid='private.kinto_payment_hold_gate_p4()'::regprocedure
  ) or not exists (
    select 1 from pg_trigger t where not t.tgisinternal and t.tgenabled in ('O','A')
      and t.tgrelid='private.kinto_payment_attempts_p4'::regclass
      and t.tgfoid='private.kinto_payment_p5_resolution_sync_campaign()'::regprocedure
  ) then
    raise exception 'A required campaign payment guard or synchronization trigger is absent';
  end if;
end;
$verify$;
rollback;
