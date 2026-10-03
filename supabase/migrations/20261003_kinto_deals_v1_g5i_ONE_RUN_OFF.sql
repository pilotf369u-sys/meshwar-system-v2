-- G5I ONE RUN: paid-only quota + canonical payment lifecycle. Run ONCE, flag stays OFF.
-- Do not separately run the two constituent migrations after this bundle.
begin;
-- G5I: pending orders never consume campaign quota. Confirmed payments do.
-- This function is the G5G canonical reservation with only the two quota filters updated.
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
 v_gift jsonb;
 v_gift_count integer;
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
 -- Serialize reservation integrity; only PAID confirmations consume scarce allocations.
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
 -- Gift line is frozen inside the canonical INSERT snapshot, never counted as paid.
 select count(*)::integer into v_gift_count
 from jsonb_array_elements(v_d->'items') x
 where x->>'is_deal_gift'='true';
 if v_c.gift_product_id is null then
  if v_gift_count<>0 then raise exception 'DEALS_UNEXPECTED_GIFT' using errcode='P0001';end if;
 else
  if v_gift_count<>1 or v_d->>'deal_campaign_id' is distinct from v_c.id::text
   or v_d->>'deal_gift_insert_contract'<>'g5f_before_insert_v1' then
   raise exception 'DEALS_GIFT_SNAPSHOT_MISSING' using errcode='P0001';end if;
  select x into v_gift from jsonb_array_elements(v_d->'items') x
   where x->>'is_deal_gift'='true' limit 1;
  if v_gift->>'product_id' is distinct from v_c.gift_product_id::text
   or v_gift->>'store_id' is distinct from v_c.store_id::text
   or v_gift->>'deal_campaign_id' is distinct from v_c.id::text
   or v_gift->>'quantity'<>'1'
   or v_gift->>'unit_price_local'<>'0'
   or v_gift->>'line_total_local'<>'0'
   or v_gift->'selected_options' is distinct from v_c.gift_selected_options
   or v_gift->'gift_discount_local' is distinct from
      v_gift->'gift_original_unit_price_local' then
   raise exception 'DEALS_GIFT_SNAPSHOT_INVALID' using errcode='P0001';end if;
 end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_items
 from jsonb_array_elements(v_d->'items') x
 where coalesce(x->>'is_deal_gift','false')<>'true';
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
 where campaign_id=v_c.id and customer_id=v_customer and state='confirmed';
 select count(*)::integer into v_allocated from public.kinto_deals_v1_redemptions
 where campaign_id=v_c.id and state='confirmed';
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
   'gift_product_id',v_c.gift_product_id,'gift_line',v_gift,
   'gift_fulfilled',v_gift is not null,
   'invoice_adjusted',false,'reserved_at',now()))
 returning id into v_id;
 return jsonb_build_object('ok',true,'redemption_id',v_id,'order_id',v_o.id,
  'state','pending','gift_fulfilled',v_gift is not null,'invoice_adjusted',false,
  'internal_only',true);
end;
$deals$;
revoke all on function private.kinto_deals_v1_reserve_canonical_order_g5(text,uuid,uuid) from public,anon,authenticated;

-- G5I: lifecycle of a previously reserved DEALS redemption, additive and flag OFF.
-- AFTER status update sees the canonical V93 BEFORE UPDATE stock lifecycle result.
-- Does not change stock, invoices, ordinary order status or the existing cancellation path.
create or replace function private.kinto_deals_v1_redemption_lifecycle_g5i()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_d jsonb;
 v_paid boolean;
 v_cancel boolean;
 v_r public.kinto_deals_v1_redemptions%rowtype;
 v_c public.kinto_deals_v1_campaigns%rowtype;
 v_used integer;
 v_prior_units integer;
 v_allocated integer;
begin
 if new.status is not distinct from old.status then return new;end if;
 -- Fast no-op for every ordinary order: no reservation, no action.
 if not exists(select 1 from public.kinto_deals_v1_redemptions r
   where r.order_id=new.id and r.state='pending') then return new;end if;
 v_d:=coalesce(nullif(new.details,'')::jsonb,'{}'::jsonb);
 if v_d->>'source'<>'local_cart_bundle'
  or v_d->>'checkout_contract'<>'independent_vendor_orders' then
  raise exception 'DEALS_LIFECYCLE_ORDER_CONTRACT_INVALID' using errcode='P0001';end if;
 v_paid:=new.status='تم التسديد'
  and v_d->>'bundle_stock_lifecycle_state'='deducted';
 v_cancel:=new.status in ('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')
  and old.status<>'تم التسديد'
  and coalesce(v_d->>'bundle_stock_lifecycle_state','')<>'deducted';
 if new.status='تم التسديد' and not v_paid then
  raise exception 'DEALS_CANONICAL_STOCK_DEDUCTION_REQUIRED' using errcode='P0001';
 end if;
 if v_paid then
  -- Payment is the allocation race winner, not the earliest pending order.
  -- A rejected confirmation rolls back this status change AND V93 stock deduction.
  -- NOWAIT avoids a lock-order cycle: checkout takes campaign then order;
  -- payment already holds order and must never wait on campaign.
  select * into v_r from public.kinto_deals_v1_redemptions
   where order_id=new.id and state='pending' for update;
  if found then
   select * into v_c from public.kinto_deals_v1_campaigns
    where id=v_r.campaign_id for update nowait;
   select count(*)::integer,coalesce(sum(qualifying_units),0)::integer
    into v_used,v_prior_units from public.kinto_deals_v1_redemptions
    where campaign_id=v_r.campaign_id and customer_id=v_r.customer_id
      and state='confirmed';
   select count(*)::integer into v_allocated from public.kinto_deals_v1_redemptions
    where campaign_id=v_r.campaign_id and state='confirmed';
   if v_used>=v_c.max_uses_per_customer
     or (v_c.kind='limited_purchase'
       and v_c.max_units_per_customer is not null
       and v_prior_units+v_r.qualifying_units>v_c.max_units_per_customer)
     or (v_c.max_total_redemptions is not null
       and v_allocated>=v_c.max_total_redemptions) then
    raise exception 'نفد المنتج، حظ أوفر في حملات أخرى قريباً'
      using errcode='P0001',hint='DEALS_PAID_ALLOCATION_EXHAUSTED';
   end if;
  end if;
  update public.kinto_deals_v1_redemptions r
   set state='confirmed',updated_at=now(),
    frozen_snapshot=r.frozen_snapshot||jsonb_build_object(
     'confirmed_at',now(),'confirmation_order_status',new.status,
     'stock_lifecycle_state','deducted')
   where r.order_id=new.id and r.state='pending';
 elsif v_cancel then
  update public.kinto_deals_v1_redemptions r
   set state='released',updated_at=now(),
    frozen_snapshot=r.frozen_snapshot||jsonb_build_object(
     'released_at',now(),'release_order_status',new.status,
     'release_reason','canonical_pre_payment_cancellation')
   where r.order_id=new.id and r.state='pending';
 end if;
 -- After payment, a later status change NEVER releases or reverses a redemption.
 return new;
end;
$deals$;
revoke all on function private.kinto_deals_v1_redemption_lifecycle_g5i()
 from public,anon,authenticated;
drop trigger if exists trg_kinto_deals_v1_redemption_lifecycle_g5i on public.orders;
create trigger trg_kinto_deals_v1_redemption_lifecycle_g5i
 after update of status on public.orders for each row
 when (old.status is distinct from new.status)
 execute function private.kinto_deals_v1_redemption_lifecycle_g5i();
commit;
