-- G5C guard-only postflight: READ ONLY, expected 6 rows TRUE.
with d as (
 select pg_get_functiondef('public.kinto_deals_v1_validate_related_store()'::regprocedure) as src
)
select 'feature_still_off' as name,
 coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false) as ok
union all select 'customer_text_cast',src like '%new.customer_id::text%' from d
union all select 'canonical_segment_check',src like '%public.order_store_segments%' from d
union all select 'campaign_store_check',src like '%DEALS_RELATED_STORE_MISMATCH%' from d
union all select 'gift_store_check',src like '%DEALS_REDEMPTION_GIFT_STORE_MISMATCH%' from d
union all select 'no_deals_order_triggers',not exists(
 select 1 from pg_trigger t where t.tgrelid='public.orders'::regclass
 and not t.tgisinternal and t.tgname ilike '%deals%');
