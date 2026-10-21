-- Project only a verified legacy P5 cart payment to its owning vendor.
-- This is read-only and never updates legacy order rows or payment records.
begin;

create or replace function public.vendor_paid_electronic_invoice_orders_v1(
  p_session_token text,
  p_order_ids uuid[]
)
returns table(order_id uuid)
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $invoice_access$
declare
  v_store_id uuid;
begin
  v_store_id:=private.require_vendor_session(p_session_token);

  if coalesce(cardinality(p_order_ids),0)>500 then
    raise exception 'VENDOR_INVOICE_ORDER_LIMIT_EXCEEDED' using errcode='22023';
  end if;

  return query
  select distinct o.id
    from public.orders o
    cross join lateral (
      select case when o.details is json then o.details::jsonb else '{}'::jsonb end as details_json
    ) parsed
    join private.kinto_payments_p5 p
      on p.status='paid'
     and p.payment_kind='cart'
     and p.customer_id=o.customer_id
     and o.id=any(p.order_ids)
    join private.kinto_payment_attempts_p4 a
      on a.id=p.attempt_id
     and a.customer_id=p.customer_id
     and a.status='succeeded'
   where o.id=any(coalesce(p_order_ids,array[]::uuid[]))
     and o.delivery_payment_type in ('cod_full','product_paid_delivery_cod')
     and (
       parsed.details_json->>'source'='local_store'
       or (parsed.details_json->>'source'='local_cart_bundle'
         and parsed.details_json->>'checkout_contract'='independent_vendor_orders'
         and parsed.details_json->>'multi_store'='false')
     )
     and parsed.details_json->>'store_id'=v_store_id::text
     and exists(
       select 1
         from jsonb_array_elements(case when jsonb_typeof(parsed.details_json->'items')='array' then parsed.details_json->'items' else '[]'::jsonb end) i(item)
         join public.local_products lp on lp.id=private.v94_uuid(i.item->>'product_id')
         where lp.store_id=v_store_id
      )
     and not exists(
       select 1
         from jsonb_array_elements(case when jsonb_typeof(parsed.details_json->'items')='array' then parsed.details_json->'items' else '[]'::jsonb end) i(item)
         left join public.local_products lp on lp.id=private.v94_uuid(i.item->>'product_id')
        where lp.id is null or lp.store_id<>v_store_id
     );
end;
$invoice_access$;

revoke all on function public.vendor_paid_electronic_invoice_orders_v1(text,uuid[])
  from public,anon,authenticated;
grant execute on function public.vendor_paid_electronic_invoice_orders_v1(text,uuid[])
  to anon,authenticated;

comment on function public.vendor_paid_electronic_invoice_orders_v1(text,uuid[]) is
  'Returns only this authenticated vendor session store order IDs whose legacy cod_full or current goods-paid stamp is proven by a paid P5 cart KP linked to the exact order and a succeeded attempt. Read-only; exposes no KP, customer, or other-store payment data.';

notify pgrst,'reload schema';
commit;
