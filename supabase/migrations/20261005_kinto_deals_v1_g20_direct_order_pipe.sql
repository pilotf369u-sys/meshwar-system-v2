-- G20 phase 1: direct campaign order over the existing G5G/V101/V97 engine.
-- Additive only. Does not replace order status, stock, invoice, shipping or payment lifecycle.
begin;
create or replace function public.kinto_deals_v1_direct_order_g20(
 p_session_token text,p_campaign_id uuid,p_request_id uuid,
 p_customer_shipping jsonb,p_items jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare
 v_customer uuid; v_campaign public.kinto_deals_v1_campaigns%rowtype;
 v_checkout jsonb; v_order_id uuid; v_units integer; v_distinct integer; v_canonical_items jsonb;
begin
 v_customer:=private.require_customer_review_session(p_session_token);
 if v_customer is null then raise exception 'DEALS_CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_campaign_id is null or p_request_id is null
   or jsonb_typeof(p_items) is distinct from 'array'
   or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100
   or jsonb_typeof(p_customer_shipping) is distinct from 'object' then
  raise exception 'DEALS_DIRECT_ORDER_INVALID_INPUT' using errcode='22023';
 end if;
 select * into v_campaign from public.kinto_deals_v1_campaigns where id=p_campaign_id;
 if not found then raise exception 'DEALS_CAMPAIGN_NOT_FOUND' using errcode='P0001'; end if;

 -- Fail closed before any canonical checkout: valid rows, one campaign store, campaign products only.
 if exists(
  select 1 from jsonb_array_elements(p_items) x(item)
  where jsonb_typeof(x.item)<>'object'
   or coalesce(x.item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(x.item->>'store_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(x.item->>'quantity','') <> '1'
   or (x.item ? 'selected_options' and jsonb_typeof(x.item->'selected_options')<>'object')
 ) then raise exception 'DEALS_DIRECT_ORDER_ITEM_INVALID' using errcode='22023'; end if;
 if exists(
  select 1 from jsonb_array_elements(p_items) x(item)
  where x.item->>'store_id'<>v_campaign.store_id::text
   or not exists(select 1 from public.kinto_deals_v1_products cp
      where cp.campaign_id=v_campaign.id and cp.product_id=(x.item->>'product_id')::uuid)
 ) then raise exception 'DEALS_DIRECT_ORDER_CAMPAIGN_SCOPE_INVALID' using errcode='P0001'; end if;

 -- A campaign product is one unit only; reject repeated product ids instead of turning duplicates into quantity.
 if (select count(*) from jsonb_array_elements(p_items)) <>
    (select count(distinct (x.item->>'product_id')::uuid) from jsonb_array_elements(p_items) x(item)) then
  raise exception 'DEALS_DIRECT_ORDER_DUPLICATE_PRODUCT' using errcode='22023';
 end if;

 -- Browser-supplied variants are not authoritative. Rebuild canonical items from campaign rows.
 select jsonb_agg(jsonb_build_object(
   'store_id',v_campaign.store_id,
   'product_id',cp.product_id,
   'quantity',1,
   'selected_options',coalesce(cp.selected_options,'{}'::jsonb)
  ) order by ord.n)
 into v_canonical_items
 from jsonb_array_elements(p_items) with ordinality ord(item,n)
 join public.kinto_deals_v1_products cp
   on cp.campaign_id=v_campaign.id and cp.product_id=(ord.item->>'product_id')::uuid;
 if jsonb_array_length(v_canonical_items)<>jsonb_array_length(p_items) then
  raise exception 'DEALS_DIRECT_ORDER_CANONICAL_ITEMS_INVALID' using errcode='P0001';
 end if;

 select coalesce(sum((x.item->>'quantity')::integer),0)::integer,
        count(distinct (x.item->>'product_id')::uuid)::integer
 into v_units,v_distinct from jsonb_array_elements(p_items) x(item);
 -- Same campaign rules are enforced again by the existing G5 reservation/payment lifecycle.
 if (v_campaign.kind='choose_n' and v_distinct<v_campaign.threshold_units)
  or (v_campaign.kind='buy_n' and v_units<v_campaign.threshold_units)
  or (v_campaign.kind='limited_purchase' and
      (v_units<1 or v_units>v_campaign.max_units_per_customer)) then
  raise exception 'DEALS_THRESHOLD_NOT_MET' using errcode='P0001';
 end if;

 -- Proven idempotent atomic path. V97 remains authoritative for prices and stock preflight.
 v_checkout:=public.kinto_deals_v1_checkout_no_gift_g5d(
   p_session_token,p_campaign_id,p_request_id,p_customer_shipping,v_canonical_items);
 v_order_id:=nullif(v_checkout->'deal'->>'order_id','')::uuid;
 if v_order_id is null then raise exception 'DEALS_DIRECT_ORDER_CANONICAL_ORDER_MISSING' using errcode='P0001'; end if;

 -- Identification snapshot only; never changes KN/status/lifecycle.
 update public.orders o set details=(
  coalesce(nullif(o.details,'')::jsonb,'{}'::jsonb)||jsonb_build_object(
   'deal_campaign_id',v_campaign.id,'deal_campaign_title',v_campaign.title,
   'deal_order_kind',v_campaign.kind,'deal_order_contract','g20-direct-campaign-order-v1'
  ))::text
 where o.id=v_order_id and o.customer_id::text=v_customer::text;

 return v_checkout||jsonb_build_object(
  'direct_campaign_order',true,'campaign_order_id',v_order_id,
  'campaign_order_code',(select o.order_code from public.orders o where o.id=v_order_id),
  'deals_direct_order_contract','g20-direct-campaign-order-v1');
end;$g20$;
revoke all on function public.kinto_deals_v1_direct_order_g20(text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_direct_order_g20(text,uuid,uuid,jsonb,jsonb) to anon,authenticated;
comment on function public.kinto_deals_v1_direct_order_g20(text,uuid,uuid,jsonb,jsonb) is
'G20 direct campaign order: campaign-scoped selection -> existing atomic G5G/V101/V97 KN order; no cart or lifecycle replacement.';
notify pgrst,'reload schema';
commit;
