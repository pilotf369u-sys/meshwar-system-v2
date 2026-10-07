-- G5C: INTERNAL reservation building block. Not exposed to browser or wired to checkout.
-- Caller MUST invoke in same PostgreSQL transaction immediately after canonical V101/V97.
-- Feature OFF. This migration does not activate campaigns, gifts, stock or invoices.
begin;
create or replace function private.kinto_deals_v1_reserve_canonical_order_g5(
 p_session_token text,p_campaign_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_customer uuid;
 v_c public.kinto_deals_v1_campaigns%rowtype;
 v_o public.orders%rowtype;
 v_d jsonb;
 v_items jsonb;
 v_latest public.kinto_deals_v1_submissions%rowtype;
 v_units integer:=0;
 v_distinct integer:=0;
 v_qualifying integer:=0;
 v_all_units integer:=0;
 v_used integer:=0;
 v_prior_units integer:=0;
 v_allocated integer:=0;
 v_id uuid;
begin
 v_customer:=private.require_customer_review_session(p_session_token);
 if v_customer is null then raise exception 'DEALS_CUSTOMER_SESSION_REQUIRED' using errcode='28000';end if;
 if not coalesce((select enabled from public.kinto_deals_v1_flags
  where key='merchant_deals_enabled'),false) then
  raise exception 'DEALS_FEATURE_DISABLED' using errcode='P0001';
 end if;
 if p_campaign_id is null or p_order_id is null then
  raise exception 'DEALS_RESERVATION_INVALID' using errcode='22023';end if;
 -- Serialize all allocations of one campaign, including cross-customer requests.
 select * into v_c from public.kinto_deals_v1_campaigns
 where id=p_campaign_id for update;
 if not found or v_c.status<>'submitted'
  or v_c.starts_at>statement_timestamp() or v_c.ends_at<=statement_timestamp() then
  raise exception 'DEALS_CAMPAIGN_NOT_ACTIVE' using errcode='P0001';end if;
 select * into v_latest from public.kinto_deals_v1_submissions
 where campaign_id=v_c.id order by submitted_at desc,id desc limit 1;
 if not found or v_latest.review_state<>'acknowledged'
  or not exists(select 1 from public.kinto_deals_v1_review_events e
   where e.submission_id=v_latest.id and e.campaign_id=v_c.id
    and e.store_id=v_c.store_id and e.decision='approved') then
  raise exception 'DEALS_CAMPAIGN_NOT_APPROVED' using errcode='P0001';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if not found or v_o.customer_id is distinct from v_customer::text
  or v_o.status<>'انتظار رد الموظف' then
  raise exception 'DEALS_ORDER_NOT_ELIGIBLE' using errcode='P0001';end if;
 v_d:=coalesce(nullif(v_o.details,'')::jsonb,'{}'::jsonb);
 if v_d->>'source'<>'local_cart_bundle'
  or v_d->>'checkout_contract'<>'independent_vendor_orders'
  or v_d->>'store_id' is distinct from v_c.store_id::text
  or jsonb_typeof(v_d->'items')<>'array' then
  raise exception 'DEALS_ORDER_CONTRACT_INVALID' using errcode='P0001';end if;
 if not exists(select 1 from public.order_store_segments s
  where s.order_id=v_o.id and s.store_id=v_c.store_id and not s.payment_confirmed) then
  raise exception 'DEALS_CANONICAL_SEGMENT_MISSING' using errcode='P0001';end if;
 if exists(select 1 from public.kinto_deals_v1_redemptions r
  where r.campaign_id=v_c.id and r.order_id=v_o.id) then
  raise exception 'DEALS_ORDER_ALREADY_RESERVED' using errcode='23505';end if;
 v_items:=v_d->'items';
 if jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>100
  or exists(select 1 from jsonb_array_elements(v_items) x
   where jsonb_typeof(x)<>'object'
    or coalesce(x->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(x->>'quantity','') !~ '^([1-9][0-9]{0,2}|1000)$'
    or coalesce(x->>'store_id','')<>v_c.store_id::text
    or coalesce(x->>'line_total_local','') !~ '^[0-9]+(\\.[0-9]+)?$'
    or (x->>'line_total_local')::numeric<0) then
  raise exception 'DEALS_PAID_LINES_INVALID' using errcode='22023';end if;
 -- Only canonical paid lines count; gift is NOT appended by this helper.
 select coalesce(sum((x->>'quantity')::integer),0)::integer,
  count(distinct (x->>'product_id')::uuid)::integer
 into v_units,v_distinct
 from jsonb_array_elements(v_items) x
 where exists(select 1 from public.kinto_deals_v1_products cp
  where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid);
 select coalesce(sum((x->>'quantity')::integer),0)::integer into v_all_units
 from jsonb_array_elements(v_items) x;
 v_qualifying:=case when v_c.kind='choose_n' then v_distinct else v_units end;
 if (v_c.kind='choose_n' and v_distinct<v_c.threshold_units)
  or (v_c.kind='buy_n' and v_units<v_c.threshold_units)
  or (v_c.kind='limited_purchase' and
    (v_units<1 or v_units<>v_all_units or v_units>v_c.max_units_per_customer)) then
  raise exception 'DEALS_THRESHOLD_NOT_MET' using errcode='P0001';end if;
 select count(*)::integer,coalesce(sum(qualifying_units),0)::integer
 into v_used,v_prior_units from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and customer_id=v_customer and state in ('pending','confirmed');
 select count(*)::integer into v_allocated from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and state in ('pending','confirmed');
 if v_used>=v_c.max_uses_per_customer
  or (v_c.kind='limited_purchase' and v_prior_units+v_units>v_c.max_units_per_customer)
  or (v_c.max_total_redemptions is not null and v_allocated>=v_c.max_total_redemptions) then
  raise exception 'DEALS_ALLOCATION_LIMIT_REACHED' using errcode='P0001';end if;
 insert into public.kinto_deals_v1_redemptions(
  campaign_id,store_id,customer_id,order_id,state,qualifying_units,gift_product_id,frozen_snapshot)
 values(v_c.id,v_c.store_id,v_customer,v_o.id,'pending',v_qualifying,v_c.gift_product_id,
  jsonb_build_object('contract','g5c_private_reservation_v1',
   'campaign_kind',v_c.kind,'campaign_title',v_c.title,
   'submission_id',v_latest.id,'order_id',v_o.id,
   'paid_items',v_items,'qualifying_units',v_qualifying,
   'gift_product_id',v_c.gift_product_id,'gift_fulfilled',false,
   'invoice_adjusted',false,'reserved_at',now()))
 returning id into v_id;
 return jsonb_build_object('ok',true,'redemption_id',v_id,'order_id',v_o.id,
  'state','pending','gift_fulfilled',false,'invoice_adjusted',false,
  'internal_only',true);
end;
$deals$;
revoke all on function private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid)
 from public,anon,authenticated;
commit;
