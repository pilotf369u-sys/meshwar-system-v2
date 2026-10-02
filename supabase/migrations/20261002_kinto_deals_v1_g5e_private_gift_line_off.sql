-- G5E: private gift snapshot constructor, no triggers, no writes, no activation.
-- Intended ONLY for future feature-gated BEFORE INSERT order integration.
begin;
create or replace function private.kinto_deals_v1_gift_line_g5e(
 p_campaign_id uuid,p_store_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_c public.kinto_deals_v1_campaigns%rowtype;
 v_p public.local_products%rowtype;
 v_s public.local_stores%rowtype;
 v_price numeric;
begin
 select * into v_c from public.kinto_deals_v1_campaigns
 where id=p_campaign_id;
 if not found or v_c.store_id is distinct from p_store_id
  or v_c.gift_product_id is null or v_c.kind not in ('choose_n','buy_n') then
  raise exception 'DEALS_GIFT_CAMPAIGN_INVALID' using errcode='22023';end if;
 select * into v_p from public.local_products
 where id=v_c.gift_product_id and store_id=v_c.store_id;
 if not found or coalesce(v_p.is_out_of_stock,false)
  or (v_p.stock_quantity is not null and v_p.stock_quantity<1) then
  raise exception 'DEALS_GIFT_OUT_OF_STOCK' using errcode='P0001';end if;
 select * into v_s from public.local_stores where id=v_c.store_id;
 if not found or lower(coalesce(v_s.status,''))<>'active'
  or coalesce(v_s.exchange_rate,0)<=0
  or coalesce(v_s.commission_rate,10)<0
  or coalesce(v_s.commission_rate,10)>=100
  or coalesce(v_p.discount_price,v_p.base_price) is null
  or coalesce(v_p.discount_price,v_p.base_price)<0 then
  raise exception 'DEALS_GIFT_PRICING_UNAVAILABLE' using errcode='P0001';end if;
 v_price:=ceil((ceil(coalesce(v_p.discount_price,v_p.base_price)::numeric/
  (1-coalesce(v_s.commission_rate,10)::numeric/100))*
  v_s.exchange_rate::numeric)/1000)*1000;
 return jsonb_build_object(
  'store_id',v_c.store_id,'store_name',v_s.store_name,
  'product_id',v_p.id,'product_name',v_p.product_name,
  'product_image',v_p.image_url,
  'selected_options',v_c.gift_selected_options,
  'quantity',1,'unit_price_local',0,'line_total_local',0,
  'currency',coalesce(nullif(v_s.exchange_target_currency,''),
   nullif(v_s.default_currency,''),'IQD'),
  'is_deal_gift',true,'deal_campaign_id',v_c.id,
  'gift_original_unit_price_local',v_price,
  'gift_discount_local',v_price,
  'pricing_snapshot',jsonb_build_object(
   'pricing_version','iqd_ceil_1000_v1',
   'original_customer_price_local',v_price,
   'gift_discount_percent',100,'gift_net_price_local',0,
   'captured_at',now()));
end;
$deals$;
revoke all on function private.kinto_deals_v1_gift_line_g5e(uuid,uuid)
 from public,anon,authenticated;
commit;
