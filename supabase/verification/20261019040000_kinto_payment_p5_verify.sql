-- Read-only P5 checks. Run only against the intended environment.
select
  (select jsonb_agg(to_jsonb(x)) from public.kinto_payment_settings_g16 x where singleton) as g16,
  (select jsonb_agg(to_jsonb(x)) from public.kinto_payment_runtime_p2 x where singleton) as p2_runtime,
  (select jsonb_agg(to_jsonb(x)) from public.kinto_payment_providers_p2 x where provider_key='kinto-simulator') as simulator_provider,
  (select jsonb_agg(to_jsonb(x)) from private.kinto_payment_runtime_p4 x where singleton) as p4,
  (select jsonb_agg(to_jsonb(x)) from private.kinto_payment_runtime_p5 x where singleton) as p5,
  (select count(*) from private.kinto_payment_attempts_p4 where status='reconciliation_required') as unresolved_attempts,
  (select count(*) from private.kinto_stock_holds_p4 where status in ('active','reconciliation_required')) as held_or_unknown_stock,
  (select count(*) from private.kinto_payments_p5 where status='paid' and real_collection_allowed) as real_collection_rows;

select n.nspname as schema_name,p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       array_to_string(p.proacl,',') as privileges
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('kinto_payment_p5_quote_v1','kinto_payment_p5_reserve_v1',
 'kinto_payment_p5_start_v1','kinto_payment_p5_simulate_v1','kinto_payment_p5_status_v1',
 'kinto_payments_p5_list_v1','kinto_payment_p5_mode_read_v1')
order by n.nspname,p.proname;
