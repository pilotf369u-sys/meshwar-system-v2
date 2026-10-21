-- Read existing receipt confirmations for the current courier's visible assignments.
begin;
create or replace function public.courier_customer_receipts_v1(p_session_token text,p_order_ids uuid[])
returns table(order_id uuid,confirmed_at timestamptz)
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $body$
declare actor jsonb;
begin
 actor:=private.kinto_staff_actor_v1('courier',p_session_token);
 actor:=actor||jsonb_build_object('courier_uuid',(select c.courier_uuid from public.couriers c where c.id::text=actor->>'id'));
 if coalesce(cardinality(p_order_ids),0)>100 then
  raise exception 'COURIER_RECEIPT_ORDER_LIMIT_EXCEEDED' using errcode='22023';
 end if;
 return query
 select o.id,r.confirmed_at
 from public.orders o
 join public.order_customer_receipts_v60 r on r.order_id=o.id and r.customer_id=o.customer_id::text
 where o.id=any(coalesce(p_order_ids,array[]::uuid[]))
  and private.kinto_order_visible_v1(to_jsonb(o),actor);
end;
$body$;
revoke all on function public.courier_customer_receipts_v1(text,uuid[]) from public,anon,authenticated;
grant execute on function public.courier_customer_receipts_v1(text,uuid[]) to anon,authenticated;
comment on function public.courier_customer_receipts_v1(text,uuid[]) is
'Existing customer confirmation ID/timestamp only, scoped by courier assignment and branch. No order, receipt, collection, payment or stock writes.';
notify pgrst,'reload schema';
commit;
