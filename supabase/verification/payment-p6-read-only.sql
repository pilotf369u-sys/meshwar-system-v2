-- Payment-P6 post-apply verification. Read-only; never run this on a different
-- project than the intended KINTO project.
select
  to_regprocedure('public.kinto_payment_p6_customer_admit_v1(text)') is not null as p6_customer_gate_exists,
  to_regprocedure('public.kinto_payment_p6_simulator_admin_v1(text,text)') is not null as p6_admin_rpc_exists,
  to_regprocedure('public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)') is not null as p5_dispatch_exists,
  has_function_privilege('anon','public.kinto_payment_p6_customer_admit_v1(text)','EXECUTE') as anon_can_call_customer_gate,
  has_function_privilege('authenticated','public.kinto_payment_p6_customer_admit_v1(text)','EXECUTE') as customer_can_call_customer_gate,
  has_function_privilege('service_role','public.kinto_payment_p6_customer_admit_v1(text)','EXECUTE') as service_can_call_customer_gate,
  has_function_privilege('anon','public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)','EXECUTE') as anon_can_dispatch_outcome,
  has_function_privilege('authenticated','public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)','EXECUTE') as customer_can_dispatch_outcome,
  has_function_privilege('service_role','public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)','EXECUTE') as service_can_dispatch_outcome;

select g.payment_mode,g.gateway_environment,g.gateways_enabled,
       p.effective_mode,p.transition_state,p.electronic_admission_ready,
       s.selected_provider_key,s.emergency_stop,
       rt.simulator_enabled,rt.real_collection_allowed,
       pr.enabled as simulator_provider_enabled,pr.test_only,pr.integration_ready,
       pr.real_collection_allowed as provider_real_collection_allowed
from public.kinto_payment_settings_g16 g
cross join private.kinto_payment_runtime_p4 p
cross join public.kinto_payment_runtime_p2 s
cross join private.kinto_payment_runtime_p5 rt
left join public.kinto_payment_providers_p2 pr on pr.provider_key=s.selected_provider_key
where g.singleton and p.singleton and s.singleton and rt.singleton;

select (select count(*) from private.kinto_stock_holds_p4 h
         where h.status in ('active','reconciliation_required')) as active_holds,
       (select count(*) from private.kinto_payment_attempts_p4 a
         where a.status in ('new','reserved','pending','reconciliation_required')) as unresolved_attempts,
       (select count(*) from private.kinto_payment_attempts_p4 a
         left join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
         where a.status in ('new','reserved','pending','reconciliation_required') and h.id is null) as unsettled_attempts_without_hold;
