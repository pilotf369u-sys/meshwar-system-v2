-- KINTO vendor shipping label: scoped, read-only full COD amount.
-- No changes to orders, payment state, RLS, or other RPCs.
begin;

create or replace function public.vendor_label_full_cod_collection_v1(
 p_session_token text,
 p_segment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
 v_store_id uuid := private.require_vendor_session(p_session_token);
 v_segment public.order_store_segments%rowtype;
 v_order public.orders%rowtype;
 v_segment_count integer;
 v_group_id text;
 v_group_order_count integer;
 v_group_fee numeric;
 v_group_currency text;
 v_group_collector uuid;
 v_goods_currency text;
 v_delivery_currency text;
 v_external_currency text;
 v_external numeric;
 v_reward numeric;
 v_campaign numeric;
 v_reward_currency text;
 v_campaign_currency text;
 v_due numeric;
begin
 select s.* into v_segment
 from public.order_store_segments s
 where s.id=p_segment_id and s.store_id=v_store_id and s.payment_confirmed=true;
 if v_segment.id is null then
  raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode='P0002';
 end if;

 select o.* into v_order from public.orders o where o.id=v_segment.order_id;
 if v_order.id is null then
  raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
 end if;
 if v_order.delivery_payment_type is distinct from 'cod_full' then
  return jsonb_build_object('type',v_order.delivery_payment_type,'amounts',null);
 end if;

 -- Full parent total may be printed ONLY if this vendor owns its only segment.
 select count(*) into v_segment_count
 from public.order_store_segments where order_id=v_order.id;
 if v_segment_count<>1 or v_order.total_price is null or
    v_segment.subtotal_local is null or
    v_order.total_price is distinct from v_segment.subtotal_local then
  return jsonb_build_object('type','cod_full','amounts',null);
 end if;

 v_goods_currency:=upper(trim(coalesce(v_order.currency,'')));
 v_delivery_currency:=upper(trim(coalesce(v_order.delivery_currency,v_order.currency,'')));
 v_external_currency:=upper(trim(coalesce(v_order.external_shipping_currency,v_order.currency,'')));
 if v_goods_currency='' or v_delivery_currency<>v_goods_currency or
    v_external_currency<>v_goods_currency or
    v_order.delivery_fee is null or v_order.delivery_fee<0 or
    v_order.external_shipping_fee is null or v_order.external_shipping_fee<0 then
  return jsonb_build_object('type','cod_full','amounts',null);
 end if;

 -- A checkout group may have other orders and an external shipping collector.
 -- Such a parent total cannot be claimed as this one store's COD.
 v_group_id:=nullif(coalesce(v_order.details::jsonb ->> 'checkout_group_id',''),'');
 if v_group_id is not null then
  select count(*) into v_group_order_count
  from public.orders o
  where o.details::jsonb ->> 'checkout_group_id'=v_group_id;
  if v_group_order_count<>1 then
   return jsonb_build_object('type','cod_full','amounts',null);
  end if;
  if v_group_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select f.external_shipping_fee,f.external_shipping_currency,f.collector_segment_id
   into v_group_fee,v_group_currency,v_group_collector
   from public.checkout_group_finance f where f.checkout_group_id=v_group_id::uuid;
   if found and (v_group_fee is distinct from v_order.external_shipping_fee or
      upper(trim(coalesce(v_group_currency,'')))<>v_goods_currency or
      (v_group_fee>0 and v_group_collector is distinct from p_segment_id)) then
    return jsonb_build_object('type','cod_full','amounts',null);
   end if;
  end if;
 end if;

 v_reward:=coalesce(v_order.reward_discount_amount,0);
 v_campaign:=coalesce(v_order.kinto_campaign_discount_amount,0);
 v_reward_currency:=upper(trim(coalesce(nullif(v_order.reward_discount_currency,''),v_goods_currency)));
 v_campaign_currency:=upper(trim(coalesce(nullif(v_order.kinto_campaign_discount_currency,''),v_goods_currency)));
 if v_reward<0 or v_campaign<0 or
    (v_reward>0 and v_reward_currency<>v_goods_currency) or
    (v_campaign>0 and v_campaign_currency<>v_goods_currency) then
  return jsonb_build_object('type','cod_full','amounts',null);
 end if;
 v_due:=greatest(0,v_order.total_price+v_order.external_shipping_fee+
                       v_order.delivery_fee-v_reward-v_campaign);
 return jsonb_build_object('type','cod_full','amounts',
  case when v_due>0 then jsonb_build_array(jsonb_build_object('amount',v_due,'currency',v_goods_currency))
       else '[]'::jsonb end);
end;
$$;
revoke all on function public.vendor_label_full_cod_collection_v1(text,uuid) from public;
grant execute on function public.vendor_label_full_cod_collection_v1(text,uuid) to anon,authenticated;
comment on function public.vendor_label_full_cod_collection_v1(text,uuid)
 is 'Read-only, vendor-session-scoped COD only for verified one-segment invoices; refuses ambiguous sums.';
notify pgrst,'reload schema';
commit;
