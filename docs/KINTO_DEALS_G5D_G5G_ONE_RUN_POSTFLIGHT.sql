-- Read-only postflight after ONE-RUN G5D-G5G. All seven checks must be true.
select 'feature_remains_off' as check_name,
 not coalesce((select enabled from public.kinto_deals_v1_flags
 where key='merchant_deals_enabled'),false) as passed
union all select 'idempotency_table_exists',
 to_regclass('private.kinto_deals_v1_checkout_requests_g5d') is not null
union all select 'verified_checkout_exists',
 to_regprocedure('public.kinto_deals_v1_checkout_no_gift_g5d(text,uuid,uuid,jsonb,jsonb)') is not null
union all select 'gift_builder_exists',
 to_regprocedure('private.kinto_deals_v1_gift_line_g5e(uuid,uuid)') is not null
union all select 'gift_trigger_exists',
 exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='trg_kinto_deals_v1_gift_insert_g5f' and not tgisinternal)
union all select 'reservation_exists',
 to_regprocedure('private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)') is not null
union all select 'no_browser_grants_on_private_gift',
 not has_function_privilege('anon','private.kinto_deals_v1_gift_line_g5e(uuid,uuid)','EXECUTE')
 and not has_function_privilege('authenticated','private.kinto_deals_v1_gift_line_g5e(uuid,uuid)','EXECUTE');
