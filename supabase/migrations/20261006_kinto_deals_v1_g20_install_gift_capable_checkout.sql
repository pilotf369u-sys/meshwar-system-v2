-- G20: promote the already-reviewed G5G checkout wrapper so gift campaigns can use V101/V97.
-- Feature flag is intentionally NOT changed here; activation is a separate fail-closed migration.
begin;
create or replace function public.kinto_deals_v1_checkout_no_gift_g5d(
 p_session_token text,
 p_campaign_id uuid,
 p_request_id uuid,
 p_customer_shipping jsonb,
 p_items jsonb
) returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_customer uuid;
 v_campaign public.kinto_deals_v1_campaigns%rowtype;
 v_request private.kinto_deals_v1_checkout_requests_g5d%rowtype;
 v_hash text;
 v_checkout jsonb;
 v_order_id uuid;
 v_reservation jsonb;
begin
 v_customer:=private.require_customer_review_session(p_session_token);
 if v_customer is null then raise exception 'DEALS_CUSTOMER_SESSION_REQUIRED' using errcode='28000';end if;
 if p_campaign_id is null or p_request_id is null
  or jsonb_typeof(p_items) is distinct from 'array'
  or jsonb_typeof(p_customer_shipping) is distinct from 'object' then
  raise exception 'DEALS_CHECKOUT_INVALID_INPUT' using errcode='22023';end if;
 if not coalesce((select enabled from public.kinto_deals_v1_flags
  where key='merchant_deals_enabled'),false) then
  raise exception 'DEALS_FEATURE_DISABLED' using errcode='P0001';end if;
 -- Serialize requests for this campaign BEFORE canonical checkout/product locks.
 select * into v_campaign from public.kinto_deals_v1_campaigns
  where id=p_campaign_id for update;
 if not found then
  raise exception 'DEALS_CAMPAIGN_NOT_FOUND' using errcode='P0001';end if;
 -- Request IDs are idempotent for the same customer and identical inputs.
 v_hash:=md5(jsonb_build_object('campaign_id',p_campaign_id,
  'shipping',p_customer_shipping,'items',p_items)::text);
 insert into private.kinto_deals_v1_checkout_requests_g5d(
  customer_id,request_id,campaign_id,payload_hash)
 values(v_customer,p_request_id,p_campaign_id,v_hash)
 on conflict(customer_id,request_id) do nothing;
 select * into v_request from private.kinto_deals_v1_checkout_requests_g5d
  where customer_id=v_customer and request_id=p_request_id for update;
 if v_request.campaign_id is distinct from p_campaign_id
  or v_request.payload_hash is distinct from v_hash then
  raise exception 'DEALS_IDEMPOTENCY_KEY_REUSED' using errcode='23505';end if;
 if v_request.result is not null then return v_request.result;end if;
 -- Scope the gift context to the canonical V101 call, not subsequent statements.
 if v_campaign.gift_product_id is not null then
  perform set_config('app.kinto_deals_gift_campaign_id',v_campaign.id::text,true);
  perform set_config('app.kinto_deals_verified_customer_id',v_customer::text,true);
 end if;
 -- Preserve V101 destination fallback and V97 authoritative prices and order split.
 v_checkout:=public.checkout_independent_vendor_orders_v101(
  v_customer,null,null,p_customer_shipping,p_items);
 perform set_config('app.kinto_deals_gift_campaign_id','',true);
 perform set_config('app.kinto_deals_verified_customer_id','',true);
 select (x->>'id')::uuid into v_order_id
 from jsonb_array_elements(v_checkout->'orders') x
 where x->>'store_id'=v_campaign.store_id::text;
 if v_order_id is null then
  raise exception 'DEALS_CAMPAIGN_STORE_NOT_IN_CART' using errcode='P0001';end if;
 -- Same transaction: any failure rolls back EVERY newly created store order.
 v_reservation:=private.kinto_deals_v1_reserve_canonical_order_g5(
  p_session_token,p_campaign_id,v_order_id);
 v_checkout:=v_checkout||jsonb_build_object(
  'deal',jsonb_build_object('campaign_id',p_campaign_id,
   'order_id',v_order_id,'redemption_id',v_reservation->>'redemption_id',
   'state','pending','gift_fulfilled',v_reservation->'gift_fulfilled'),
  'deals_checkout_contract','g5g_canonical_gift_or_no_gift_v1');
 update private.kinto_deals_v1_checkout_requests_g5d
 set result=v_checkout where customer_id=v_customer and request_id=p_request_id;
 return v_checkout;
end;
$deals$;
revoke all on function public.kinto_deals_v1_checkout_no_gift_g5d(
 text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_checkout_no_gift_g5d(
 text,uuid,uuid,jsonb,jsonb) to anon,authenticated;
comment on function public.kinto_deals_v1_checkout_no_gift_g5d(
 text,uuid,uuid,jsonb,jsonb) is
'Feature-OFF by default; verified session; atomic V101/V97 checkout + gift insert + G5C reservation; idempotent request.';

notify pgrst,'reload schema';
commit;
