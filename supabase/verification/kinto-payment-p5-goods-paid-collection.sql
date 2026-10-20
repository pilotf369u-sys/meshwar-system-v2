-- Read-only post-migration verification. Does not inspect or modify order rows.
select
  to_regprocedure('private.kinto_payment_p5_stamp_goods_paid_collection_v1()') is not null as function_exists,
  exists (
    select 1 from pg_trigger
     where tgrelid='public.orders'::regclass
       and tgname='trg_00_kinto_payment_p5_goods_paid_collection'
       and not tgisinternal
  ) as trigger_exists,
  coalesce(has_function_privilege('anon','private.kinto_payment_p5_stamp_goods_paid_collection_v1()','EXECUTE'),false) as anon_can_execute,
  coalesce(has_function_privilege('authenticated','private.kinto_payment_p5_stamp_goods_paid_collection_v1()','EXECUTE'),false) as authenticated_can_execute;

-- Expected: function_exists=true, trigger_exists=true, anon_can_execute=false, authenticated_can_execute=false.
