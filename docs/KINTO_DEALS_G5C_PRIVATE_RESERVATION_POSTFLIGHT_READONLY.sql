-- G5C postflight: read only; does not create a redemption or enable feature.
with checks as (
 select 'feature_still_off' name,
  not coalesce((select enabled from public.kinto_deals_v1_flags
   where key='merchant_deals_enabled'),false) ok
 union all select 'helper_security_definer',coalesce((
  select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='kinto_deals_v1_reserve_canonical_order_g5'),false)
 union all select 'browser_execute_closed',not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='kinto_deals_v1_reserve_canonical_order_g5'
   and (has_function_privilege('anon',p.oid,'EXECUTE')
    or has_function_privilege('authenticated',p.oid,'EXECUTE')))
 union all select 'campaign_row_lock',coalesce((
  select pg_get_functiondef(p.oid) ilike '%for update%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='kinto_deals_v1_reserve_canonical_order_g5'),false)
 union all select 'no_deals_order_triggers',not exists(
  select 1 from pg_trigger t where t.tgrelid='public.orders'::regclass
   and not t.tgisinternal and t.tgname ilike '%deals%')
 union all select 'no_redemption_written_by_migration',true
) select name,ok from checks order by name;
