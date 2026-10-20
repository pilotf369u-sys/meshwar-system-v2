-- Invoice eligibility only. No order, payment, collection, or stock writes.
begin;
create or replace function public.branch_paid_collection_orders_v1(
 p_session_token text,p_order_ids uuid[]
) returns table(order_id uuid)
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $body$
declare actor jsonb;
begin
 actor:=private.kinto_staff_actor_v1('branch',p_session_token);
 if coalesce(cardinality(p_order_ids),0)>100 then
  raise exception 'BRANCH_COLLECTION_ORDER_LIMIT_EXCEEDED' using errcode='22023';
 end if;
 return query
 select distinct o.id from public.orders o
 cross join lateral (select case when o.details is json then o.details::jsonb else '{}'::jsonb end as d) parsed
 join private.kinto_payments_p5 p on p.status='paid' and p.payment_kind='cart'
  and p.customer_id=o.customer_id and o.id=any(p.order_ids)
 join private.kinto_payment_attempts_p4 a on a.id=p.attempt_id and a.customer_id=p.customer_id and a.status='succeeded'
 where o.id=any(coalesce(p_order_ids,array[]::uuid[]))
  and private.kinto_order_visible_v1(to_jsonb(o),actor)
  and o.delivery_payment_type in ('cod_full','product_paid_delivery_cod')
  and (parsed.d->>'source'='local_store'
   or (parsed.d->>'source'='local_cart_bundle'
    and parsed.d->>'checkout_contract'='independent_vendor_orders'
    and parsed.d->>'multi_store'='false'));
end;
$body$;
revoke all on function public.branch_paid_collection_orders_v1(text,uuid[]) from public,anon,authenticated;
grant execute on function public.branch_paid_collection_orders_v1(text,uuid[]) to anon,authenticated;
comment on function public.branch_paid_collection_orders_v1(text,uuid[]) is
'Session-guarded paid cart invoice proof for branch orders only. No financial or order writes.';
notify pgrst,'reload schema';
commit;
