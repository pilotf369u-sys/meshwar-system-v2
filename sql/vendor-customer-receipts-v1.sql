-- Existing customer receipt proof for this vendor's visible orders only.
begin;
create or replace function public.vendor_customer_receipts_v1(p_session_token text,p_order_ids uuid[])
returns table(order_id uuid,confirmed_at timestamptz)
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $body$
declare store uuid;
begin
 store:=private.require_vendor_session(p_session_token);
 if coalesce(cardinality(p_order_ids),0)>100 then
  raise exception 'VENDOR_RECEIPT_ORDER_LIMIT_EXCEEDED' using errcode='22023';
 end if;
 return query
 select o.id,r.confirmed_at
 from public.orders o
 join public.order_customer_receipts_v60 r on r.order_id=o.id and r.customer_id=o.customer_id::text
 cross join lateral (select private.v94_jsonb_object(to_jsonb(o.details)) as d) parsed
 where o.id=any(coalesce(p_order_ids,array[]::uuid[]))
 and (
  exists(select 1 from public.order_store_segments s where s.order_id=o.id and s.store_id=store and s.payment_confirmed=true)
  or (parsed.d->>'source'='local_store' and parsed.d->>'store_id'=store::text)
  or (parsed.d->>'source'='local_cart_bundle' and exists(
   select 1 from jsonb_array_elements(case when jsonb_typeof(parsed.d->'items')='array' then parsed.d->'items' else '[]'::jsonb end) i
   where i->>'store_id'=store::text
  ))
 );
end;
$body$;
revoke all on function public.vendor_customer_receipts_v1(text,uuid[]) from public,anon,authenticated;
grant execute on function public.vendor_customer_receipts_v1(text,uuid[]) to anon,authenticated;
comment on function public.vendor_customer_receipts_v1(text,uuid[]) is
'Existing customer receipt timestamps for session-owned legacy orders or confirmed store segments. No order, stock, payment or receipt writes.';
notify pgrst,'reload schema';
commit;
