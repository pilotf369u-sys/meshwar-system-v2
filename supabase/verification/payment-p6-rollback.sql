-- Payment-P6 rollback. Review and run manually only after the simulator has
-- been stopped, P4 is stably manual, and all P4 holds/outcomes are resolved.
-- This does not touch the KINTO order, stock, coupon, invoice, or payment ledgers.
begin;

do $preflight$
begin
  if not exists(select 1 from private.kinto_payment_runtime_p4 where singleton and effective_mode='manual' and transition_state='stable') then
    raise exception 'P6_ROLLBACK_REQUIRES_STABLE_MANUAL_MODE';
  end if;
  if exists(select 1 from private.kinto_stock_holds_p4 where status in ('active','reconciliation_required'))
     or exists(select 1 from private.kinto_payment_attempts_p4 where status in ('new','reserved','pending','reconciliation_required')) then
    raise exception 'P6_ROLLBACK_REQUIRES_ALL_ATTEMPTS_RESOLVED';
  end if;
end;
$preflight$;

update public.kinto_payment_runtime_p2
   set emergency_stop=true,emergency_reason='P6 rollback',emergency_actor='P6 rollback',
       emergency_changed_at=clock_timestamp(),updated_at=clock_timestamp()
 where singleton;
update private.kinto_payment_runtime_p5 set simulator_enabled=false,updated_at=clock_timestamp() where singleton;
update private.kinto_payment_runtime_p4 set electronic_admission_ready=false,updated_at=clock_timestamp() where singleton;

-- Restore the original P5 service-only dispatcher. The rolled-back Edge
-- Function must also be redeployed; its missing test-access RPC will fail
-- closed on production until a separately reviewed rollback is complete.
create or replace function public.kinto_payment_p5_simulate_dispatch_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $dispatch$
declare cid uuid; kind text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 cid:=private.require_customer_review_session(p_session_token);
 if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 select payment_kind into kind from private.kinto_payments_p5
   where attempt_id=p_attempt_id and customer_id=cid::text;
 if not found then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if kind='campaign' then
   return public.kinto_payment_p5_campaign_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping);
 end if;
 return public.kinto_payment_p5_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping);
end;
$dispatch$;
revoke all on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) to service_role;

drop function if exists public.kinto_payment_p6_customer_admit_v1(text);
drop function if exists public.kinto_payment_p6_simulator_admin_v1(text,text);
notify pgrst,'reload schema';
commit;
