-- G5I READ ONLY postflight. Expected every passed=true. Does not enable campaigns.
with checks as (
 select 'feature_remains_off' check_name,
   not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false) passed
 union all select 'reservation_function_exists',
   to_regprocedure('private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)') is not null
 union all select 'payment_lifecycle_function_exists',
   to_regprocedure('private.kinto_deals_v1_redemption_lifecycle_g5i()') is not null
 union all select 'payment_lifecycle_trigger_exists',
   exists(select 1 from pg_trigger where tgname='trg_kinto_deals_v1_redemption_lifecycle_g5i'
     and tgrelid='public.orders'::regclass and not tgisinternal)
 union all select 'private_lifecycle_not_browser_executable',
   not has_function_privilege('anon','private.kinto_deals_v1_redemption_lifecycle_g5i()','EXECUTE')
   and not has_function_privilege('authenticated','private.kinto_deals_v1_redemption_lifecycle_g5i()','EXECUTE')
 union all select 'reservation_counts_confirmed_only',
   (select count(*)=2 from regexp_matches(
    pg_get_functiondef('private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)'::regprocedure),
    'state=''confirmed''','g'))
 union all select 'payment_quota_has_nonblocking_lock',
   position('for update nowait' in lower(pg_get_functiondef(
    'private.kinto_deals_v1_redemption_lifecycle_g5i()'::regprocedure)))>0
) select * from checks order by check_name;
