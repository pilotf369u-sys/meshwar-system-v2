-- G5B: server-verified, READ-ONLY preview. NOT a checkout/reservation or pricing authority.
-- Feature OFF => no campaign details, no qualifying result. No writes to any table.
begin;
create or replace function public.kinto_deals_v1_customer_quote_g5(
 p_session_token text,p_campaign_id uuid,p_paid_items jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_customer uuid;v_c public.kinto_deals_v1_campaigns%rowtype;
 v_count integer;v_units integer;v_qualifying integer;
 v_used integer;v_allocated integer;v_prior_units integer;v_latest public.kinto_deals_v1_submissions%rowtype;
begin
 v_customer:=private.require_customer_review_session(p_session_token);
 if v_customer is null then raise exception 'DEALS_CUSTOMER_SESSION_REQUIRED' using errcode='28000';end if;
 if not coalesce((select enabled from public.kinto_deals_v1_flags
  where key='merchant_deals_enabled'),false) then
  return jsonb_build_object('eligible',false,'reason','feature_disabled','binding',false);
 end if;
 if p_campaign_id is null or p_paid_items is null or jsonb_typeof(p_paid_items)<>'array'
  or jsonb_array_length(p_paid_items) not between 1 and 100 then
  raise exception 'DEALS_QUOTE_INVALID_ITEMS' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_paid_items) x
  where jsonb_typeof(x)<>'object'
   or coalesce(x->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,2}$'
   or case when coalesce(x->>'quantity','') ~ '^[1-9][0-9]{0,2}
  raise exception 'DEALS_QUOTE_INVALID_LINE' using errcode='22023';end if;
 select * into v_c from public.kinto_deals_v1_campaigns
 where id=p_campaign_id and status='submitted'
 and starts_at<=statement_timestamp() and ends_at>statement_timestamp();
 if not found then return jsonb_build_object('eligible',false,'reason','not_active','binding',false);end if;
 select * into v_latest from public.kinto_deals_v1_submissions
 where campaign_id=v_c.id order by submitted_at desc,id desc limit 1;
 if not found or v_latest.review_state<>'acknowledged'
  or not exists(select 1 from public.kinto_deals_v1_review_events e
   where e.submission_id=v_latest.id and e.campaign_id=v_c.id
   and e.store_id=v_c.store_id and e.decision='approved') then
  return jsonb_build_object('eligible',false,'reason','not_approved','binding',false);
 end if;
 -- Any unrelated paid line makes this one-store quote invalid. Other stores quote separately.
 if exists(select 1 from jsonb_array_elements(p_paid_items) x
  where not exists(select 1 from public.local_products p
   where p.id=(x->>'product_id')::uuid and p.store_id=v_c.store_id
   and coalesce(p.is_out_of_stock,false)=false)) then
  return jsonb_build_object('eligible',false,'reason','store_or_product_unavailable','binding',false);
 end if;
 select coalesce(sum((x->>'quantity')::integer),0)::integer into v_units
 from jsonb_array_elements(p_paid_items) x
 where exists(select 1 from public.kinto_deals_v1_products cp
  where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid);
 select count(distinct (x->>'product_id')::uuid)::integer into v_count
 from jsonb_array_elements(p_paid_items) x
 where exists(select 1 from public.kinto_deals_v1_products cp
  where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid);
 if v_c.kind='limited_purchase' and exists(
  select 1 from jsonb_array_elements(p_paid_items) x
  where not exists(select 1 from public.kinto_deals_v1_products cp
   where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid)) then
  return jsonb_build_object('eligible',false,'reason','exclusive_items_only','binding',false);
 end if;
 v_qualifying:=case when v_c.kind='choose_n' then v_count else v_units end;
 if (v_c.kind='choose_n' and v_count<v_c.threshold_units)
  or (v_c.kind='buy_n' and v_units<v_c.threshold_units)
  or (v_c.kind='limited_purchase' and (v_units<1 or v_units>v_c.max_units_per_customer)) then
  return jsonb_build_object('eligible',false,'reason','threshold_not_met','binding',false);
 end if;
 select count(*)::integer into v_used from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and customer_id=v_customer and state in ('pending','confirmed');
 select coalesce(sum(qualifying_units),0)::integer into v_prior_units from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and customer_id=v_customer and state in ('pending','confirmed');
 select count(*)::integer into v_allocated from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and state in ('pending','confirmed');
 if v_used>=v_c.max_uses_per_customer
  or (v_c.kind='limited_purchase' and v_prior_units+v_units>v_c.max_units_per_customer)
  or (v_c.max_total_redemptions is not null and v_allocated>=v_c.max_total_redemptions) then
  return jsonb_build_object('eligible',false,'reason','limit_reached','binding',false);
 end if;
 return jsonb_build_object('eligible',true,'binding',false,'reservation_created',false,
  'campaign_id',v_c.id,'store_id',v_c.store_id,'kind',v_c.kind,
  'qualifying_units',v_qualifying,'gift_product_id',v_c.gift_product_id,
  'remaining_estimate',case when v_c.max_total_redemptions is null then null
   else greatest(v_c.max_total_redemptions-v_allocated,0) end,
  'note','Read-only estimate. Revalidate under locks at canonical checkout.');
end;
$deals$;
revoke all on function public.kinto_deals_v1_customer_quote_g5(text,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_customer_quote_g5(text,uuid,jsonb)
 to anon,authenticated;
commit;
 then (x->>'quantity')::integer>100 else true end) then
  raise exception 'DEALS_QUOTE_INVALID_LINE' using errcode='22023';end if;
 select * into v_c from public.kinto_deals_v1_campaigns
 where id=p_campaign_id and status='submitted'
 and starts_at<=statement_timestamp() and ends_at>statement_timestamp();
 if not found then return jsonb_build_object('eligible',false,'reason','not_active','binding',false);end if;
 select * into v_latest from public.kinto_deals_v1_submissions
 where campaign_id=v_c.id order by submitted_at desc,id desc limit 1;
 if not found or v_latest.review_state<>'acknowledged'
  or not exists(select 1 from public.kinto_deals_v1_review_events e
   where e.submission_id=v_latest.id and e.campaign_id=v_c.id
   and e.store_id=v_c.store_id and e.decision='approved') then
  return jsonb_build_object('eligible',false,'reason','not_approved','binding',false);
 end if;
 -- Any unrelated paid line makes this one-store quote invalid. Other stores quote separately.
 if exists(select 1 from jsonb_array_elements(p_paid_items) x
  where not exists(select 1 from public.local_products p
   where p.id=(x->>'product_id')::uuid and p.store_id=v_c.store_id
   and coalesce(p.is_out_of_stock,false)=false)) then
  return jsonb_build_object('eligible',false,'reason','store_or_product_unavailable','binding',false);
 end if;
 select coalesce(sum((x->>'quantity')::integer),0)::integer into v_units
 from jsonb_array_elements(p_paid_items) x
 where exists(select 1 from public.kinto_deals_v1_products cp
  where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid);
 select count(distinct (x->>'product_id')::uuid)::integer into v_count
 from jsonb_array_elements(p_paid_items) x
 where exists(select 1 from public.kinto_deals_v1_products cp
  where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid);
 if v_c.kind='limited_purchase' and exists(
  select 1 from jsonb_array_elements(p_paid_items) x
  where not exists(select 1 from public.kinto_deals_v1_products cp
   where cp.campaign_id=v_c.id and cp.product_id=(x->>'product_id')::uuid)) then
  return jsonb_build_object('eligible',false,'reason','exclusive_items_only','binding',false);
 end if;
 v_qualifying:=case when v_c.kind='choose_n' then v_count else v_units end;
 if (v_c.kind='choose_n' and v_count<v_c.threshold_units)
  or (v_c.kind='buy_n' and v_units<v_c.threshold_units)
  or (v_c.kind='limited_purchase' and (v_units<1 or v_units>v_c.max_units_per_customer)) then
  return jsonb_build_object('eligible',false,'reason','threshold_not_met','binding',false);
 end if;
 select count(*)::integer into v_used from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and customer_id=v_customer and state in ('pending','confirmed');
 select count(*)::integer into v_allocated from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and state in ('pending','confirmed');
 if v_used>=v_c.max_uses_per_customer
  or (v_c.max_total_redemptions is not null and v_allocated>=v_c.max_total_redemptions) then
  return jsonb_build_object('eligible',false,'reason','limit_reached','binding',false);
 end if;
 return jsonb_build_object('eligible',true,'binding',false,'reservation_created',false,
  'campaign_id',v_c.id,'store_id',v_c.store_id,'kind',v_c.kind,
  'qualifying_units',v_qualifying,'gift_product_id',v_c.gift_product_id,
  'remaining_estimate',case when v_c.max_total_redemptions is null then null
   else greatest(v_c.max_total_redemptions-v_allocated,0) end,
  'note','Read-only estimate. Revalidate under locks at canonical checkout.');
end;
$deals$;
revoke all on function public.kinto_deals_v1_customer_quote_g5(text,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_customer_quote_g5(text,uuid,jsonb)
 to anon,authenticated;
commit;
