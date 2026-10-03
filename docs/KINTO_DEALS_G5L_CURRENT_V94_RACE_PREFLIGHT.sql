-- G5L READ ONLY readiness: current live V94 independent-vendor guard.
-- Run after G5K. All checks should PASS. Does NOT simulate concurrent payments.
with defs as (
 select lower(pg_get_functiondef(to_regprocedure('public.meshwar_independent_vendor_order_guard()'))) guard,
 lower(pg_get_functiondef(to_regprocedure('public.meshwar_local_cart_bundle_stock_lifecycle()'))) stock,
 lower(pg_get_functiondef(to_regprocedure('private.kinto_deals_v1_redemption_lifecycle_g5i()'))) lifecycle,
 lower(pg_get_functiondef(to_regprocedure('private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)'))) reserve
), checks as (
 select '01_production_flag_off' check_name,
 not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false) passed
 union all select '02_current_v94_guard_enabled',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_meshwar_independent_vendor_order_guard' and tgenabled in ('O','A')
 and (tgtype & 2)=2 and (tgtype & 16)=16)
 union all select '03_immutable_items_preserved',
 coalesce((select guard like '%''items''%' and guard like '%v_immutable%' from defs),false)
 union all select '04_paid_marker_monotonic',
 coalesce((select guard like '%bundle_stock_lifecycle_state%' and guard like '%v_old -> v_key%' from defs),false)
 union all select '05_paid_cancellation_rejected',
 coalesce((select guard like '%old.status = ''تم التسديد''%' and guard like '%cannot be cancelled or rejected%' from defs),false)
 union all select '06_stock_before_status',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_meshwar_local_cart_bundle_stock_lifecycle' and tgenabled in ('O','A')
 and (tgtype & 2)=2 and (tgtype & 16)=16)
 union all select '07_campaign_confirmation_after_status',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_kinto_deals_v1_redemption_lifecycle_g5i' and tgenabled in ('O','A')
 and (tgtype & 2)=0 and (tgtype & 16)=16)
 union all select '08_all_items_stock_checked',
 coalesce((select stock like '%jsonb_array_elements(d->''items'')%'
 and stock like '%bundle_stock_lifecycle_state%' from defs),false)
 union all select '09_pending_does_not_consume_quota',
 coalesce((select reserve not like '%state in (''pending'',''confirmed'')%'
 and (select count(*)=2 from regexp_matches(reserve,
 'state[[:space:]]*=[[:space:]]*''confirmed''','g')) from defs),false)
 union all select '10_paid_quota_nowait_atomic',
 coalesce((select lifecycle ~ 'for[[:space:]]+update[[:space:]]+nowait'
 and lifecycle like '%deals_paid_allocation_exhausted%' from defs),false)
 union all select '11_browser_cannot_call_private_lifecycle',
 not has_function_privilege('anon','private.kinto_deals_v1_redemption_lifecycle_g5i()','EXECUTE')
 and not has_function_privilege('authenticated','private.kinto_deals_v1_redemption_lifecycle_g5i()','EXECUTE')
) select check_name,passed from checks order by check_name;
