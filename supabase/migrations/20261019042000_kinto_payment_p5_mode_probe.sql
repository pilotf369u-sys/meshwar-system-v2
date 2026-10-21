-- Correct the P5 probe to require aligned G16/P4 mode and the selected no-charge test provider.
begin;
create or replace function public.kinto_payment_p5_mode_read_v1(p_session_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $mode$
declare cid uuid; r record;
begin
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 select g.payment_mode,p.effective_mode,p.transition_state,p.electronic_admission_ready,s.emergency_stop,
   coalesce(rt.simulator_enabled,false) simulator_enabled,
   (s.selected_provider_key='kinto-simulator' and exists(select 1 from public.kinto_payment_providers_p2 pr
      where pr.provider_key=s.selected_provider_key and pr.enabled and pr.test_only and not pr.real_collection_allowed)) simulator_provider_ready into r
 from public.kinto_payment_settings_g16 g cross join private.kinto_payment_runtime_p4 p
 cross join public.kinto_payment_runtime_p2 s cross join private.kinto_payment_runtime_p5 rt
 where g.singleton and p.singleton and s.singleton and rt.singleton;
 return jsonb_build_object('effective_mode',r.effective_mode,'transition_state',r.transition_state,'electronic_admission_ready',r.electronic_admission_ready,
   'emergency_stop',r.emergency_stop,'simulator_enabled',r.simulator_enabled,'simulator_provider_ready',r.simulator_provider_ready,'real_collection_allowed',false,
   'checkout_available',r.payment_mode='electronic' and r.effective_mode='electronic' and r.transition_state='stable'
     and r.electronic_admission_ready and not r.emergency_stop and r.simulator_enabled and r.simulator_provider_ready);
end;$mode$;
revoke all on function public.kinto_payment_p5_mode_read_v1(text) from public;
grant execute on function public.kinto_payment_p5_mode_read_v1(text) to anon,authenticated;
commit;
