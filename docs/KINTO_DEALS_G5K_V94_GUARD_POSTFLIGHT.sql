-- G5K read-only postflight; all PASS required. Does not prove live concurrency.
with f as (
 select lower(pg_get_functiondef(to_regprocedure(
  'public.meshwar_independent_vendor_order_guard()'))) body
), checks as (
 select '01_feature_off' check_name,
 not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false) passed
 union all select '02_v94_guard_trigger_enabled',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_meshwar_independent_vendor_order_guard' and tgenabled in ('O','A'))
 union all select '03_immutable_items_retained',
 coalesce((select body like '%''items''%' and body like '%v_immutable%' from f),false)
 union all select '04_paid_marker_monotonic',
 coalesce((select body like '%bundle_stock_lifecycle_state%' and
 body like '%v_old -> v_key%' and body like '%''deducted''%' from f),false)
 union all select '05_paid_cancellation_locked',
 coalesce((select body like '%old.status = ''تم التسديد''%' and
 body like '%new.status = any%' and body like '%cannot be cancelled or rejected%' from f),false)
 union all select '06_canonical_stock_trigger_enabled',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_meshwar_local_cart_bundle_stock_lifecycle' and tgenabled in ('O','A'))
 union all select '07_campaign_paid_trigger_enabled',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_kinto_deals_v1_redemption_lifecycle_g5i' and tgenabled in ('O','A'))
) select check_name,passed from checks order by check_name;
