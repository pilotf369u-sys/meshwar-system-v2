-- Read existing customer receipt confirmations. No order/payment/stock writes.
begin;
create or replace function public.staff_customer_receipts_v1(
 p_role text,p_session_token text,p_order_ids uuid[]
) returns table(order_id uuid,confirmed_at timestamptz)
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $body$
declare actor jsonb;
begin
 if p_role is null or p_role not in ('admin','employee','branch') then
  raise exception 'RECEIPT_STAFF_ROLE_REQUIRED' using errcode='42501';
 end if;
 actor:=private.kinto_staff_actor_v1(p_role,p_session_token);
 if coalesce(cardinality(p_order_ids),0)>100 then
  raise exception 'RECEIPT_ORDER_LIMIT_EXCEEDED' using errcode='22023';
 end if;
 return query
 select o.id,r.confirmed_at
 from public.orders o
 join public.order_customer_receipts_v60 r on r.order_id=o.id and r.customer_id=o.customer_id::text
 where o.id=any(coalesce(p_order_ids,array[]::uuid[]))
  and private.kinto_order_visible_v1(to_jsonb(o),actor);
end;
$body$;
revoke all on function public.staff_customer_receipts_v1(text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.staff_customer_receipts_v1(text,text,uuid[]) to anon,authenticated;
comment on function public.staff_customer_receipts_v1(text,text,uuid[]) is
'Session-scoped staff receipt badges; existing customer confirmations only, branch visibility enforced.';
notify pgrst,'reload schema';
commit;
