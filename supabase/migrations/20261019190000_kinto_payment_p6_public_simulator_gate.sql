-- Payment-P6: permit the no-charge KINTO simulator for ordinary customer
-- sessions only after an explicit, audited admin activation. This migration
-- does not enable the simulator or real collection by default.
begin;

create table if not exists private.kinto_payment_mode_audit_p6 (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null check (action in ('simulator_prepared','simulator_opened','simulator_closed')),
  previous_state jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_state)='object'),
  new_state jsonb not null default '{}'::jsonb check (jsonb_typeof(new_state)='object'),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.kinto_payment_mode_audit_p6 enable row level security;
revoke all on private.kinto_payment_mode_audit_p6 from public,anon,authenticated;

-- Edge-only admission check. It validates the actual KINTO customer session,
-- then derives access from the locked admin/runtime state. No customer grant or
-- self-service allowlist is created for the production project.
create or replace function public.kinto_payment_p6_customer_admit_v1(p_session_token text)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $admit$
declare cid uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  cid:=private.require_customer_review_session(p_session_token);
  if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  return exists (
    select 1
    from public.kinto_payment_settings_g16 g
    cross join private.kinto_payment_runtime_p4 p
    cross join public.kinto_payment_runtime_p2 s
    cross join private.kinto_payment_runtime_p5 rt
    cross join public.kinto_payment_providers_p2 pr
    where pr.provider_key=s.selected_provider_key
      and g.singleton and g.payment_mode='electronic' and g.gateway_environment='sandbox'
      and p.singleton and p.effective_mode='electronic' and p.transition_state='stable'
      and p.electronic_admission_ready
      and s.singleton and not s.emergency_stop and s.selected_provider_key='kinto-simulator'
      and rt.singleton and rt.simulator_enabled and not rt.real_collection_allowed
      and pr.enabled and pr.checkout_protocol='simulator' and pr.test_only and not pr.real_collection_allowed
      and not pr.integration_ready
  );
end;
$admit$;
revoke all on function public.kinto_payment_p6_customer_admit_v1(text) from public,anon,authenticated;
grant execute on function public.kinto_payment_p6_customer_admit_v1(text) to service_role;

-- Admin-only readiness and activation controls. prepare does not change the
-- effective mode. open is only valid after the existing P4 transition has
-- completed. close is only valid after P4 is stably manual and all P4 holds
-- have been resolved. The P2 emergency stop remains the immediate kill switch.
create or replace function public.kinto_payment_p6_simulator_admin_v1(
  p_session_token text,p_action text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $admin$
declare aid text; g public.kinto_payment_settings_g16%rowtype; p private.kinto_payment_runtime_p4%rowtype;
        s public.kinto_payment_runtime_p2%rowtype; rt private.kinto_payment_runtime_p5%rowtype;
        pr public.kinto_payment_providers_p2%rowtype; prev jsonb; active_holds integer; unresolved integer;
begin
  aid:=private.require_admin_session_v147(p_session_token);
  if nullif(btrim(aid),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kinto-payment-p6-mode',0));
  select * into g from public.kinto_payment_settings_g16 where singleton for update;
  select * into p from private.kinto_payment_runtime_p4 where singleton for update;
  select * into s from public.kinto_payment_runtime_p2 where singleton for update;
  select * into rt from private.kinto_payment_runtime_p5 where singleton for update;
  select * into pr from public.kinto_payment_providers_p2 where provider_key='kinto-simulator' for update;
  if g.singleton is distinct from true or p.singleton is distinct from true or s.singleton is distinct from true
     or rt.singleton is distinct from true or pr.provider_key is null then
    raise exception 'P6_PAYMENT_RUNTIME_NOT_CONFIGURED' using errcode='55000';
  end if;
  select count(*) filter(where h.status in ('active','reconciliation_required')),
         count(*) filter(where a.status in ('pending','reconciliation_required'))
    into active_holds,unresolved
    from private.kinto_stock_holds_p4 h join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id;

  if p_action='get' then
    return jsonb_build_object('ok',true,'payment_mode',g.payment_mode,'gateway_environment',g.gateway_environment,
      'effective_mode',p.effective_mode,'transition_state',p.transition_state,'electronic_admission_ready',p.electronic_admission_ready,
      'simulator_enabled',rt.simulator_enabled,'simulator_provider_selected',s.selected_provider_key='kinto-simulator',
      'simulator_provider_enabled',pr.enabled,'emergency_stop',s.emergency_stop,'active_holds',active_holds,
      'unresolved_attempts',unresolved,'real_collection_allowed',false);
  elsif p_action='prepare' then
    if g.payment_mode<>'electronic' or g.gateway_environment<>'sandbox' or g.gateways_enabled then
      raise exception 'P6_SELECT_ELECTRONIC_SANDBOX_FIRST' using errcode='55000';
    end if;
    if s.selected_provider_key<>'kinto-simulator' or not pr.enabled or pr.checkout_protocol<>'simulator' or not pr.test_only or pr.real_collection_allowed or pr.integration_ready then
      raise exception 'P6_SIMULATOR_PROVIDER_NOT_READY' using errcode='55000';
    end if;
    if not s.emergency_stop or p.effective_mode<>'manual' or p.transition_state<>'stable' then
      raise exception 'P6_PREPARE_REQUIRES_STABLE_MANUAL_AND_EMERGENCY_STOP' using errcode='55000';
    end if;
    if active_holds>0 or unresolved>0 then raise exception 'P6_ACTIVE_ATTEMPTS_REQUIRE_RECONCILIATION' using errcode='55000'; end if;
    prev:=jsonb_build_object('simulator_enabled',rt.simulator_enabled,'electronic_admission_ready',p.electronic_admission_ready);
    update private.kinto_payment_runtime_p5 set simulator_enabled=true,updated_at=clock_timestamp() where singleton;
    update private.kinto_payment_runtime_p4 set electronic_admission_ready=true,updated_at=clock_timestamp(),updated_by=aid where singleton;
    insert into private.kinto_payment_mode_audit_p6(actor_id,action,previous_state,new_state)
      values(aid,'simulator_prepared',prev,jsonb_build_object('simulator_enabled',true,'electronic_admission_ready',true,'real_collection_allowed',false));
  elsif p_action='open' then
    if g.payment_mode<>'electronic' or g.gateway_environment<>'sandbox' or g.gateways_enabled
      or p.effective_mode<>'electronic' or p.transition_state<>'stable' or not p.electronic_admission_ready
      or not rt.simulator_enabled or rt.real_collection_allowed or s.selected_provider_key<>'kinto-simulator'
      or not pr.enabled or pr.checkout_protocol<>'simulator' or not pr.test_only or pr.real_collection_allowed or pr.integration_ready then
      raise exception 'P6_SIMULATOR_OPEN_GUARDS_FAILED' using errcode='55000';
    end if;
    if active_holds>0 or unresolved>0 then raise exception 'P6_ACTIVE_ATTEMPTS_REQUIRE_RECONCILIATION' using errcode='55000'; end if;
    if not s.emergency_stop then
      return jsonb_build_object('ok',true,'already_open',true,'effective_mode',p.effective_mode,'real_collection_allowed',false);
    end if;
    prev:=jsonb_build_object('emergency_stop',true);
    update public.kinto_payment_runtime_p2 set emergency_stop=false,emergency_reason=null,emergency_actor=aid,
      emergency_changed_at=clock_timestamp(),updated_at=clock_timestamp() where singleton;
    insert into private.kinto_payment_mode_audit_p6(actor_id,action,previous_state,new_state)
      values(aid,'simulator_opened',prev,jsonb_build_object('emergency_stop',false,'real_collection_allowed',false));
  elsif p_action='close' then
    if not s.emergency_stop then raise exception 'P6_EMERGENCY_STOP_FIRST' using errcode='55000'; end if;
    if p.effective_mode<>'manual' or p.transition_state<>'stable' then raise exception 'P6_MANUAL_TRANSITION_REQUIRED' using errcode='55000'; end if;
    if active_holds>0 or unresolved>0 then raise exception 'P6_ACTIVE_ATTEMPTS_REQUIRE_RECONCILIATION' using errcode='55000'; end if;
    prev:=jsonb_build_object('simulator_enabled',rt.simulator_enabled,'electronic_admission_ready',p.electronic_admission_ready);
    update private.kinto_payment_runtime_p5 set simulator_enabled=false,updated_at=clock_timestamp() where singleton;
    update private.kinto_payment_runtime_p4 set electronic_admission_ready=false,updated_at=clock_timestamp(),updated_by=aid where singleton;
    insert into private.kinto_payment_mode_audit_p6(actor_id,action,previous_state,new_state)
      values(aid,'simulator_closed',prev,jsonb_build_object('simulator_enabled',false,'electronic_admission_ready',false,'real_collection_allowed',false));
  else
    raise exception 'P6_INVALID_ADMIN_ACTION' using errcode='22023';
  end if;
  select * into p from private.kinto_payment_runtime_p4 where singleton;
  select * into s from public.kinto_payment_runtime_p2 where singleton;
  select * into rt from private.kinto_payment_runtime_p5 where singleton;
  return jsonb_build_object('ok',true,'action',p_action,'payment_mode',g.payment_mode,
    'effective_mode',p.effective_mode,'transition_state',p.transition_state,
    'electronic_admission_ready',p.electronic_admission_ready,'simulator_enabled',rt.simulator_enabled,
    'emergency_stop',s.emergency_stop,'real_collection_allowed',false);
end;
$admin$;
revoke all on function public.kinto_payment_p6_simulator_admin_v1(text,text) from public;
grant execute on function public.kinto_payment_p6_simulator_admin_v1(text,text) to anon,authenticated;

-- The Edge Function calls this service-only dispatcher. It no longer requires
-- a test-account grant on production; the gates above are authoritative.
create or replace function public.kinto_payment_p5_simulate_dispatch_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $dispatch$
declare cid uuid; kind text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token);
 if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 if not public.kinto_payment_p6_customer_admit_v1(p_session_token) then raise exception 'PAYMENT_P6_SIMULATOR_CLOSED' using errcode='55000'; end if;
 select payment_kind into kind from private.kinto_payments_p5 where attempt_id=p_attempt_id and customer_id=cid::text;
 if not found then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if p_scenario not in ('success','failure','cancel','unknown','disconnect') then raise exception 'PAYMENT_P5_SCENARIO_INVALID' using errcode='22023'; end if;
 if kind='campaign' then return public.kinto_payment_p5_campaign_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping); end if;
 return public.kinto_payment_p5_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping);
end;
$dispatch$;
revoke all on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
