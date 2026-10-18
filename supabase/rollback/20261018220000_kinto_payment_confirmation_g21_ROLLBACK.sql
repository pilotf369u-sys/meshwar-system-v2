-- Review-only rollback for an isolated database after all captured intents are reconciled.
-- Do not run on production without an explicit approval. Audit tables/rows are retained.
begin;

drop trigger if exists trg_kinto_payment_stock_guard_g21 on public.orders;
drop trigger if exists trg_kinto_coupon_hold_expiry_g21 on public.kinto_coupon_reservations_g20;

-- Restore the V401 coupon selector by removing only G21's exact live-hold predicate.
do $restore_v401$
declare
  v_definition text;
  v_g21 text:='and q.status=''active'' and not exists ('||
    'select 1 from public.kinto_coupon_reservations_g20 cr '||
    'join public.kinto_stock_reservations_g20 r on r.id=cr.reservation_id '||
    'where cr.coupon_id=q.id and cr.status=''active'' and cr.expires_at>clock_timestamp() '||
    'and r.status=''active'' and r.expires_at>clock_timestamp())';
begin
  v_definition:=pg_get_functiondef('public.customer_apply_coupon_v310(text,text,bigint)'::regprocedure);
  if position(v_g21 in v_definition)>0 then
    execute replace(v_definition,v_g21,'and q.status=''active''');
  end if;
end;
$restore_v401$;

drop function if exists public.kinto_payment_finalize_g21(bigint);
drop function if exists public.kinto_payment_record_verified_event_g21(uuid,text,text,text,text,boolean,text,bigint,text);
drop function if exists public.kinto_payment_admit_reserved_intent_g21(text,uuid,uuid,text,jsonb);
drop function if exists private.kinto_payment_consume_coupon_g21(uuid,uuid,uuid,bigint);
drop function if exists private.kinto_payment_stock_guard_g21();
drop function if exists private.kinto_coupon_hold_expiry_g21();
drop function if exists private.kinto_payment_stock_available_g21(integer,integer,integer);
drop index if exists public.kinto_payment_intents_g21_one_intent_per_quote_idx;

-- Keep kinto_payment_stock_permits_g21, payment_order_links_g21 and all payment
-- event/intent records for audit; remove only transient permit rows after review.
delete from private.kinto_payment_stock_permits_g21;
commit;
