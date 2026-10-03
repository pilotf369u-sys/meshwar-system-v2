-- G5J preflight, READ ONLY. Do not enable campaign flag or mutate real orders.
-- Expected all PASS. This is structural readiness, NOT a substitute for two-session concurrency testing.
with defs as (
 select
  lower(pg_get_functiondef('public.meshwar_local_cart_bundle_stock_lifecycle()'::regprocedure)) stock,
  lower(pg_get_functiondef('private.kinto_deals_v1_redemption_lifecycle_g5i()'::regprocedure)) lifecycle,
  lower(pg_get_functiondef('private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)'::regprocedure)) reserve
), checks as (
 select '01_flag_off' check_name,
  not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false) passed
 union all select '02_canonical_stock_before_status',
  exists(select 1 from pg_trigger t where t.tgrelid='public.orders'::regclass
   and t.tgname='trg_meshwar_local_cart_bundle_stock_lifecycle' and not t.tgisinternal
   and (t.tgtype & 2)=2 and (t.tgtype & 16)=16)
 union all select '03_deal_confirmation_after_status',
  exists(select 1 from pg_trigger t where t.tgrelid='public.orders'::regclass
   and t.tgname='trg_kinto_deals_v1_redemption_lifecycle_g5i' and not t.tgisinternal
   and (t.tgtype & 2)=0 and (t.tgtype & 16)=16)
 union all select '04_stock_checks_all_order_items',
  (select stock like '%jsonb_array_elements(d->''items'')%' and
   stock like '%for update%' and stock like '%bundle_stock_lifecycle_state%' from defs)
 union all select '05_payment_requires_stock_marker',
  (select lifecycle like '%deals_canonical_stock_deduction_required%' and
   lifecycle like '%bundle_stock_lifecycle_state%' from defs)
 union all select '06_payment_quota_serialized',
  (select lifecycle ~ 'for[[:space:]]+update[[:space:]]+nowait'
   and lifecycle like '%deals_paid_allocation_exhausted%' from defs)
 union all select '07_pending_does_not_occupy_campaign_cap',
  (select reserve not like '%state in (''pending'',''confirmed'')%'
   and (select count(*)=2 from regexp_matches(reserve,
    'state[[:space:]]*=[[:space:]]*''confirmed''','g')) from defs)
 union all select '08_paid_orders_immutable',
  lower(pg_get_functiondef('public.meshwar_local_cart_bundle_guard()'::regprocedure))
    like '%old.status = ''تم التسديد''%'
 union all select '09_no_browser_lifecycle_execution',
  not has_function_privilege('anon','private.kinto_deals_v1_redemption_lifecycle_g5i()','EXECUTE')
  and not has_function_privilege('authenticated','private.kinto_deals_v1_redemption_lifecycle_g5i()','EXECUTE')
) select check_name,passed from checks order by check_name;
