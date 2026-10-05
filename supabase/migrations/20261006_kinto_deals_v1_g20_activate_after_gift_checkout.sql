-- G20 activation gate. Run only after the companion gift-capable checkout migration is installed.
begin;
do $g20$
begin
 if to_regprocedure('private.kinto_deals_v1_gift_line_g5e(uuid,uuid)') is null
  or to_regprocedure('private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)') is null
  or to_regprocedure('private.kinto_deals_v1_redemption_lifecycle_g5i()') is null
  or not exists(select 1 from pg_trigger where tgname='trg_kinto_deals_v1_gift_insert_g5f' and tgrelid='public.orders'::regclass and not tgisinternal) then
  raise exception 'DEALS_GIFT_PIPELINE_NOT_READY';
 end if;
end;$g20$;
update public.kinto_deals_v1_flags set enabled=true,updated_at=now() where key='merchant_deals_enabled';
do $g20$
begin
 if not exists(select 1 from public.kinto_deals_v1_flags where key='merchant_deals_enabled' and enabled) then raise exception 'DEALS_ACTIVATION_FLAG_MISSING'; end if;
end;$g20$;
notify pgrst,'reload schema';
commit;
