-- Run only on a dedicated isolated Supabase database after the G20-C and G21 migrations.
-- These are database behavior/privilege checks, separate from Node adapter tests.
begin;
do $$
declare
  v_guard_trigger boolean;
  v_coupon_trigger boolean;
  v_coupon_body text;
begin
  if not private.kinto_payment_stock_available_g21(1,0,1) then
    raise exception 'last unit should pass with no outstanding hold';
  end if;
  if private.kinto_payment_stock_available_g21(1,1,1) then
    raise exception 'last unit must be blocked while a live hold exists';
  end if;
  if not private.kinto_payment_stock_available_g21(5,2,3) then
    raise exception 'exact remaining quantity should pass';
  end if;
  if private.kinto_payment_stock_available_g21(5,2,4) then
    raise exception 'request above remaining quantity must fail';
  end if;
  if not private.kinto_payment_stock_available_g21(null,100,1) then
    raise exception 'unmanaged total stock must preserve legacy unlimited behavior';
  end if;

  select exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
    and tgname='trg_kinto_payment_stock_guard_g21' and not tgisinternal and tgenabled='O')
    into v_guard_trigger;
  if not v_guard_trigger then raise exception 'G21 shared manual/electronic paid stock guard is not enabled'; end if;
  select exists(select 1 from pg_trigger where tgrelid='public.kinto_coupon_reservations_g20'::regclass
    and tgname='trg_kinto_coupon_hold_expiry_g21' and not tgisinternal and tgenabled='O')
    into v_coupon_trigger;
  if not v_coupon_trigger then raise exception 'expired coupon holds are not cleaned before a new hold'; end if;

  if has_function_privilege('anon','public.kinto_payment_record_verified_event_g21(uuid,text,text,text,text,boolean,text,bigint,text)','EXECUTE')
     or has_function_privilege('authenticated','public.kinto_payment_record_verified_event_g21(uuid,text,text,text,text,boolean,text,bigint,text)','EXECUTE') then
    raise exception 'untrusted API roles must not record verified provider events';
  end if;
  if has_function_privilege('anon','public.kinto_payment_finalize_g21(bigint)','EXECUTE')
     or has_function_privilege('authenticated','public.kinto_payment_finalize_g21(bigint)','EXECUTE') then
    raise exception 'untrusted API roles must not finalize captured payments';
  end if;
  if has_function_privilege('anon','public.kinto_payment_admit_reserved_intent_g21(text,uuid,uuid,text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.kinto_payment_admit_reserved_intent_g21(text,uuid,uuid,text,jsonb)','EXECUTE') then
    raise exception 'untrusted API roles must not admit real payment intents';
  end if;
  select pg_get_functiondef('public.customer_apply_coupon_v310(text,text,bigint)'::regprocedure) into v_coupon_body;
  if position('kinto_coupon_reservations_g20' in v_coupon_body)=0 then
    raise exception 'manual V310/V401 coupon selection must skip live G20 holds';
  end if;
end $$;
rollback;
