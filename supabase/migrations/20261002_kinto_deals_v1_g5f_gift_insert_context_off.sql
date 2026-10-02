-- G5F: feature-gated BEFORE INSERT gift injection for a future verified checkout wrapper.
-- The context is deliberately NOT set by this migration: ordinary V101/V97 is unchanged.
-- This trigger fails closed for an incomplete context; no order/stock/invoice writes by migration.
begin;
create or replace function private.kinto_deals_v1_inject_gift_g5f()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_campaign_id uuid;
 v_customer_id uuid;
 v_c public.kinto_deals_v1_campaigns%rowtype;
 v_d jsonb;
 v_paid jsonb;
 v_gift jsonb;
 v_units integer;
 v_distinct integer;
 v_existing integer;
 v_gift_stock integer;
begin
 if nullif(current_setting('app.kinto_deals_gift_campaign_id',true),'') is null then
  return new;
 end if;
 -- Only a trusted, verified future wrapper may set this transaction-local context.
 if not coalesce((select enabled from public.kinto_deals_v1_flags
  where key='merchant_deals_enabled'),false) then
  raise exception 'DEALS_FEATURE_DISABLED' using errcode='P0001';end if;
 v_campaign_id:=private.v94_uuid(current_setting('app.kinto_deals_gift_campaign_id',true));
 v_customer_id:=private.v94_uuid(current_setting('app.kinto_deals_verified_customer_id',true));
 if v_campaign_id is null or v_customer_id is null
  or new.customer_id is distinct from v_customer_id::text then
  raise exception 'DEALS_GIFT_CONTEXT_INVALID' using errcode='28000';end if;
 v_d:=coalesce(nullif(new.details,'')::jsonb,'{}'::jsonb);
 if v_d->>'source'<>'local_cart_bundle'
  or v_d->>'checkout_contract'<>'independent_vendor_orders' then
  raise exception 'DEALS_GIFT_ORDER_CONTRACT_INVALID' using errcode='P0001';end if;
 select * into v_c from public.kinto_deals_v1_campaigns
 where id=v_campaign_id;
 if not found then raise exception 'DEALS_GIFT_CAMPAIGN_NOT_FOUND' using errcode='P0001';end if;
 -- Multi-store canonical checkout: inject into the owning store order ONLY.
 if v_d->>'store_id' is distinct from v_c.store_id::text then return new;end if;
 if v_c.gift_product_id is null or v_c.kind not in ('choose_n','buy_n')
  or v_c.status<>'submitted'
  or v_c.starts_at>statement_timestamp() or v_c.ends_at<=statement_timestamp()
  or not exists (
   select 1 from public.kinto_deals_v1_submissions sub
   join public.kinto_deals_v1_review_events ev
    on ev.submission_id=sub.id and ev.campaign_id=v_c.id
     and ev.store_id=v_c.store_id and ev.decision='approved'
   where sub.campaign_id=v_c.id and sub.review_state='acknowledged'
    and sub.id=(select s.id from public.kinto_deals_v1_submissions s
      where s.campaign_id=v_c.id order by s.submitted_at desc,s.id desc limit 1))
 then raise exception 'DEALS_GIFT_CAMPAIGN_NOT_APPROVED_ACTIVE' using errcode='P0001';end if;
 v_paid:=v_d->'items';
 if jsonb_typeof(v_paid)<>'array' or jsonb_array_length(v_paid)<1
  or exists(select 1 from jsonb_array_elements(v_paid) x
   where coalesce(x->>'is_deal_gift','false')='true'
    or private.v94_uuid(x->>'product_id') is null
    or private.v94_numeric(x->>'quantity',0)<1) then
  raise exception 'DEALS_GIFT_PAID_ITEMS_INVALID' using errcode='22023';end if;
 select coalesce(sum((x->>'quantity')::integer),0)::integer,
  count(distinct (x->>'product_id')::uuid)::integer
 into v_units,v_distinct from jsonb_array_elements(v_paid) x
 where exists(select 1 from public.kinto_deals_v1_products cp
  where cp.campaign_id=v_c.id and cp.product_id=private.v94_uuid(x->>'product_id'));
 if (v_c.kind='choose_n' and v_distinct<v_c.threshold_units)
  or (v_c.kind='buy_n' and v_units<v_c.threshold_units) then
  raise exception 'DEALS_GIFT_THRESHOLD_NOT_MET' using errcode='P0001';end if;
 -- Check combined paid+gift quantity, including when gift product is also paid.
 select coalesce(sum((x->>'quantity')::integer),0)::integer into v_existing
 from jsonb_array_elements(v_paid) x
 where private.v94_uuid(x->>'product_id')=v_c.gift_product_id;
 select stock_quantity into v_gift_stock from public.local_products
 where id=v_c.gift_product_id and store_id=v_c.store_id for update;
 if not found or (v_gift_stock is not null and v_gift_stock<v_existing+1) then
  raise exception 'DEALS_GIFT_COMBINED_STOCK_INSUFFICIENT' using errcode='P0001';end if;
 v_gift:=private.kinto_deals_v1_gift_line_g5e(v_c.id,v_c.store_id);
 new.details:=(v_d||jsonb_build_object(
  'items',v_paid||jsonb_build_array(v_gift),
  'deal_campaign_id',v_c.id,
  'deal_gift_snapshot',v_gift,
  'deal_gift_net_local',0,
  'deal_gift_discount_local',v_gift->'gift_discount_local',
  'deal_gift_original_local',v_gift->'gift_original_unit_price_local',
  'deal_gift_insert_contract','g5f_before_insert_v1'
 ))::text;
 -- Canonical paid subtotal/total are deliberately unchanged. Existing V93 payment
 -- stock lifecycle will see this gift as one additional quantity exactly once.
 return new;
end;
$deals$;
revoke all on function private.kinto_deals_v1_inject_gift_g5f()
 from public,anon,authenticated;
drop trigger if exists trg_kinto_deals_v1_gift_insert_g5f on public.orders;
create trigger trg_kinto_deals_v1_gift_insert_g5f
 before insert on public.orders for each row
 execute function private.kinto_deals_v1_inject_gift_g5f();
commit;
