-- Campaign checkout quantities and quota validation. Existing function grants are retained.
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
   or (v_campaign.kind<>'buy_n' and coalesce(x.item->>'quantity','')<>'1')
   or (v_campaign.kind='buy_n' and (jsonb_array_length(p_items)<>1
      or (x.item->>'quantity') is distinct from v_campaign.threshold_units::text))
   or (x.item ? 'selected_options' and jsonb_typeof(x.item->'selected_options')<>'object')
 ) then raise exception 'DEALS_DIRECT_ORDER_ITEM_INVALID' using errcode='22023'; end if;
 if exists(
  select 1 from jsonb_array_elements(p_items) x(item)
  where x.item->>'store_id'<>v_campaign.store_id::text
   or not exists(select 1 from public.kinto_deals_v1_products cp
      where cp.campaign_id=v_campaign.id and cp.product_id=(x.item->>'product_id')::uuid)
 ) then raise exception 'DEALS_DIRECT_ORDER_CAMPAIGN_SCOPE_INVALID' using errcode='P0001'; end if;

 -- Reject repeated product IDs. A buy_n selection is a single canonical line.
 if (select count(*) from jsonb_array_elements(p_items)) <>
    (select count(distinct (x.item->>'product_id')::uuid) from jsonb_array_elements(p_items) x(item)) then
  raise exception 'DEALS_DIRECT_ORDER_DUPLICATE_PRODUCT' using errcode='22023';
 end if;

 -- Browser-supplied variants are not authoritative. Rebuild canonical items from campaign rows.
 select jsonb_agg(jsonb_build_object(
   'store_id',v_campaign.store_id,
   'product_id',cp.product_id,
   'quantity',(ord.item->>'quantity')::integer,
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

 -- Preserve replay even if stock changed after the original successful checkout.
 if v_campaign.kind='buy_n' and not exists (
   select 1 from private.kinto_deals_v1_checkout_requests_g5d r
   where r.customer_id=v_customer and r.request_id=p_request_id and r.result is not null
 ) then
  perform private.kinto_deals_v1_assert_product_available_g21b(
   v_campaign.store_id,(v_canonical_items->0->>'product_id')::uuid,
   v_canonical_items->0->'selected_options',v_units);
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
create or replace function public.kinto_payment_p5_campaign_reserve_v1(
  p_session_token text,p_idempotency_key text,p_campaign_id uuid,p_items jsonb,
  p_coupon_points jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $campaign_reserve$
declare
  cid uuid; c public.kinto_deals_v1_campaigns%rowtype; latest public.kinto_deals_v1_submissions%rowtype;
  q jsonb; gift jsonb; hold_lines jsonb; a jsonb; attempt uuid; kp text; amount numeric;
  used_total integer; used_customer integer; confirmed_units bigint; held_units bigint; requested_units bigint; old_status text; old_campaign uuid; old_q jsonb; old_hash text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  cid:=private.require_customer_review_session(p_session_token);
  if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  if p_campaign_id is null or p_idempotency_key is null or p_idempotency_key !~* '^[0-9a-f-]{36}$'
    or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<1
    or jsonb_typeof(coalesce(p_coupon_points,'{}'::jsonb)) is distinct from 'object'
    or coalesce(p_coupon_points,'{}'::jsonb)<>'{}'::jsonb then
    raise exception 'PAYMENT_P5_CAMPAIGN_COUPONS_OR_INPUT_REJECTED' using errcode='22023';
  end if;
  if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
    or not exists(select 1 from private.kinto_payment_runtime_p4 where singleton and electronic_admission_ready and effective_mode='electronic' and transition_state='stable')
    or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then
    raise exception 'PAYMENT_P5_NOT_AVAILABLE' using errcode='55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text||':'||p_idempotency_key,0));
  if exists(select 1 from private.kinto_payment_attempts_p4 old where old.customer_id=cid::text and old.idempotency_key=p_idempotency_key) then
    select p.attempt_id,p.kp_number,p.status,p.quote_snapshot,(p.quote_snapshot->>'campaign_id')::uuid,h.request_hash
      into attempt,kp,old_status,old_q,old_campaign,old_hash
      from private.kinto_payments_p5 p join private.kinto_payment_attempts_p4 x on x.id=p.attempt_id
      left join private.kinto_payment_campaign_holds_p5 h on h.attempt_id=p.attempt_id
      where x.customer_id=cid::text and x.idempotency_key=p_idempotency_key;
    if old_campaign is distinct from p_campaign_id or old_hash is distinct from md5(jsonb_build_object('campaign_id',p_campaign_id,'items',p_items)::text) then
      raise exception 'PAYMENT_P5_IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'attempt_id',attempt,'kp_number',kp,'status',old_status,'reused',true,'quote',old_q);
  end if;
  select * into c from public.kinto_deals_v1_campaigns where id=p_campaign_id for update;
  if not found or c.status<>'submitted' or c.starts_at>clock_timestamp() or c.ends_at<=clock_timestamp()
    or not exists(select 1 from public.kinto_deals_v1_flags where key='merchant_deals_enabled' and enabled)
    or not exists(select 1 from public.kinto_deals_v1_publications_g7 where campaign_id=c.id and published) then
    raise exception 'DEALS_CAMPAIGN_NOT_ACTIVE' using errcode='P0001';
  end if;
  select * into latest from public.kinto_deals_v1_submissions where campaign_id=c.id order by submitted_at desc,id desc limit 1;
  if not found or latest.review_state<>'acknowledged'
    or not exists(select 1 from public.kinto_deals_v1_review_events e where e.submission_id=latest.id and e.campaign_id=c.id and e.store_id=c.store_id and e.decision='approved') then
    raise exception 'DEALS_CAMPAIGN_NOT_APPROVED' using errcode='P0001';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x(item)
      left join public.kinto_deals_v1_products cp on cp.campaign_id=c.id and cp.product_id=private.v94_uuid(x.item->>'product_id')
      left join public.local_products p on p.id=cp.product_id and p.store_id=c.store_id
      where cp.product_id is null or p.id is null or (x.item->>'store_id') is distinct from c.store_id::text
        or coalesce(x.item->'selected_options','{}'::jsonb) is distinct from cp.selected_options) then
    raise exception 'DEALS_CAMPAIGN_PRODUCT_OR_OPTIONS_INVALID' using errcode='22023';
  end if;
  q:=private.kinto_payment_p5_quote_v1(cid,p_items,'{}'::jsonb);
  if exists(select 1 from jsonb_array_elements(q->'lines') x where (x->>'store_id')::uuid<>c.store_id) then
    raise exception 'DEALS_CAMPAIGN_SINGLE_STORE_REQUIRED' using errcode='22023';
  end if;
  select sum((line->>'quantity')::integer) into requested_units
    from jsonb_array_elements(q->'lines') line;
  if (c.kind='choose_n' and (
        jsonb_array_length(q->'lines')<>c.threshold_units
        or requested_units<>c.threshold_units
        or (select count(distinct line->>'product_id') from jsonb_array_elements(q->'lines') line)<>c.threshold_units))
    or (c.kind='buy_n' and (jsonb_array_length(q->'lines')<>1 or requested_units<>c.threshold_units))
    or (c.kind='limited_purchase' and (requested_units<1 or requested_units>c.max_units_per_customer
        or requested_units<>jsonb_array_length(q->'lines')
        or (select count(distinct line->>'product_id') from jsonb_array_elements(q->'lines') line)<>requested_units)) then
    raise exception 'DEALS_THRESHOLD_NOT_MET' using errcode='22023';
  end if;

  -- Confirmed redemptions and unresolved electronic attempts consume quota.
  -- The campaign row lock serializes admission with both reservations and finalization.
  select count(*)::integer, count(*) filter(where r.customer_id=cid)::integer,
         coalesce(sum(r.qualifying_units) filter(where r.customer_id=cid),0)
    into used_total,used_customer,confirmed_units
    from public.kinto_deals_v1_redemptions r where r.campaign_id=c.id and r.state='confirmed';
  select used_total+count(*)::integer, used_customer+count(*) filter(where h.customer_id=cid::text)::integer,
         coalesce(sum((select sum((line->>'quantity')::integer)
                        from jsonb_array_elements(p.quote_snapshot->'lines') line))
                  filter(where h.customer_id=cid::text),0)
    into used_total,used_customer,held_units
    from private.kinto_payment_campaign_holds_p5 h
    join private.kinto_payment_attempts_p4 a4 on a4.id=h.attempt_id
    join private.kinto_payments_p5 p on p.attempt_id=h.attempt_id
    where h.campaign_id=c.id and (
      h.status='reconciliation_required'
      or (h.status='active' and (h.expires_at>clock_timestamp() or a4.status in ('pending','reconciliation_required')))
    );
  if (c.max_total_redemptions is not null and used_total>=c.max_total_redemptions)
     or used_customer>=c.max_uses_per_customer
     or (c.kind='limited_purchase' and confirmed_units+held_units+requested_units>c.max_units_per_customer) then
    raise exception 'DEALS_ALLOCATION_LIMIT_REACHED' using errcode='P0001';
  end if;

  if c.gift_product_id is not null then gift:=private.kinto_deals_v1_gift_line_g5e(c.id,c.store_id); else gift:=null; end if;
  hold_lines:=case when gift is null then q->'lines' else (q->'lines')||jsonb_build_array(gift) end;

  amount:=(q->>'amount')::numeric;
  a:=public.kinto_payment_attempt_reserve_p4(cid,p_idempotency_key,q->>'currency',amount,
    q||jsonb_build_object('payment_kind','campaign','campaign_id',c.id,'gift_line',gift,'lines',hold_lines),hold_lines);
  attempt:=(a->>'attempt_id')::uuid;
  kp:='KP-'||lpad(nextval('private.kinto_payment_kp_number_p5')::text,9,'0');
  insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,currency,amount,status,quote_snapshot)
    values(attempt,kp,cid::text,'campaign',q->>'currency',amount,'reserved',
      q||jsonb_build_object('campaign_id',c.id,'gift_line',gift,'hold_lines',hold_lines));
  insert into private.kinto_payment_campaign_holds_p5(attempt_id,campaign_id,customer_id,status,expires_at,request_hash)
    values(attempt,c.id,cid::text,'active',(a->>'expires_at')::timestamptz,md5(jsonb_build_object('campaign_id',c.id,'items',p_items)::text));
  return jsonb_build_object('ok',true,'attempt_id',attempt,'kp_number',kp,'status','reserved','expires_at',a->>'expires_at',
    'quote',q||jsonb_build_object('campaign_id',c.id,'gift_line',gift,'hold_lines',hold_lines),
    'physical_stock_changed',false,'coupon_points',jsonb_build_object(),'real_collection_allowed',false);
end;$campaign_reserve$;
create or replace function private.kinto_payment_p5_resolution_sync_campaign() returns trigger
language plpgsql security definer set search_path=pg_catalog,private as $sync$
begin
 if new.status in ('failed','cancelled','expired') and old.status is distinct from new.status then
   update private.kinto_payments_p5 set status=new.status,updated_at=clock_timestamp() where attempt_id=new.id and status<>'paid';
   update private.kinto_payment_campaign_holds_p5 set status='released',updated_at=clock_timestamp() where attempt_id=new.id and status in ('active','reconciliation_required');
 elsif new.status='reconciliation_required' and old.status is distinct from new.status then
   update private.kinto_payments_p5 set status=new.status,updated_at=clock_timestamp()
     where attempt_id=new.id and payment_kind='campaign' and status not in ('paid','reconciliation_required');
   update private.kinto_payment_campaign_holds_p5 set status='reconciliation_required',updated_at=clock_timestamp()
     where attempt_id=new.id and status='active';
 end if;
 return new;
end;$sync$;
create or replace function public.kinto_payment_p5_campaign_simulate_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $campaign_simulate$
declare cid uuid;p private.kinto_payments_p5%rowtype;a private.kinto_payment_attempts_p4%rowtype;h private.kinto_stock_holds_p4%rowtype;
 ch private.kinto_payment_campaign_holds_p5%rowtype;ev text;v_outcome text;checkout jsonb;oid uuid; campaign public.kinto_deals_v1_campaigns%rowtype;ord public.orders%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token);
 if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
   or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then raise exception 'PAYMENT_P5_SIMULATOR_CLOSED' using errcode='55000'; end if;
 if p_scenario not in ('success','failure','cancel','unknown','disconnect') or p_event_key is null then raise exception 'PAYMENT_P5_SCENARIO_INVALID' using errcode='22023'; end if;
 select * into p from private.kinto_payments_p5 where attempt_id=p_attempt_id and payment_kind='campaign' for update;
 if not found or p.customer_id<>cid::text then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if p.status='paid' then return jsonb_build_object('ok',true,'duplicate',true,'kp_number',p.kp_number,'status','paid','order_ids',p.order_ids); end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=p_attempt_id for update;
 select * into ch from private.kinto_payment_campaign_holds_p5 where attempt_id=p_attempt_id for update;
 if a.status<>'pending' or h.status<>'active' or ch.status not in ('active','reconciliation_required') then raise exception 'PAYMENT_P5_ATTEMPT_NOT_PENDING' using errcode='55000'; end if;
 if h.expires_at<=clock_timestamp() and p_scenario='success' then raise exception 'PAYMENT_P5_HOLD_EXPIRED' using errcode='55000'; end if;
 v_outcome:=case when p_scenario='success' then 'succeeded' when p_scenario='failure' then 'failed' when p_scenario='cancel' then 'cancelled' else 'unknown' end;
 ev:='p5:'||p_attempt_id::text||':'||p_event_key::text;
 insert into private.kinto_payment_events_p4(attempt_id,provider_key,provider_event_id,outcome,evidence_digest)
   values(p_attempt_id,a.provider_key,ev,v_outcome,'server-simulator-campaign-v1') on conflict(provider_key,provider_event_id) do nothing;
 if not found and not exists(select 1 from private.kinto_payment_events_p4 where provider_key=a.provider_key and provider_event_id=ev and attempt_id=p_attempt_id and outcome=v_outcome) then
   raise exception 'PAYMENT_P5_EVENT_REPLAY_MISMATCH' using errcode='23505'; end if;
 if v_outcome in ('failed','cancelled') then
   update private.kinto_payment_attempts_p4 set status=v_outcome,updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='released',released_at=clock_timestamp(),release_reason='p5_campaign_'||v_outcome where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='released',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status=v_outcome,updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status',v_outcome,'real_collection_allowed',false);
 elsif v_outcome='unknown' then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','reconciliation_required','message','جارٍ التحقق','hold_retained',true);
 end if;
 begin
   -- Lock the same campaign row as admission and compare the reserved options
   -- and gift before the canonical engine writes or deducts anything.
   select * into campaign from public.kinto_deals_v1_campaigns where id=ch.campaign_id for update;
   if not found or not exists(select 1 from public.kinto_deals_v1_publications_g7
       where campaign_id=campaign.id and published)
     or campaign.gift_product_id::text is distinct from (p.quote_snapshot->'gift_line'->>'product_id')
     or (campaign.gift_product_id is not null and
         campaign.gift_selected_options is distinct from (p.quote_snapshot->'gift_line'->'selected_options'))
     or exists(
       select 1 from jsonb_array_elements(p.quote_snapshot->'input_items') x(item)
       left join public.kinto_deals_v1_products cp
         on cp.campaign_id=campaign.id and cp.product_id=(x.item->>'product_id')::uuid
       where cp.product_id is null
         or (x.item->>'store_id') is distinct from campaign.store_id::text
         or coalesce(x.item->'selected_options','{}'::jsonb) is distinct from cp.selected_options
     ) then raise exception 'DEALS_CAMPAIGN_RESERVATION_CHANGED'; end if;
   insert into private.kinto_payment_finalize_permits_p5(transaction_id,attempt_id,customer_id) values(txid_current(),p_attempt_id,cid::text);
   checkout:=public.kinto_deals_v1_checkout_no_gift_g5d(p_session_token,
     (p.quote_snapshot->>'campaign_id')::uuid,gen_random_uuid(),coalesce(p_shipping,'{}'::jsonb),p.quote_snapshot->'input_items');
   oid:=(checkout->'deal'->>'order_id')::uuid;
   if oid is null then raise exception 'PAYMENT_P5_CAMPAIGN_ORDER_MISSING'; end if;
   select * into ord from public.orders where id=oid for update;
   if not found or ord.customer_id<>cid::text or ord.currency<>p.currency or ord.total_price::numeric<>p.amount then
     raise exception 'PAYMENT_P5_CAMPAIGN_CANONICAL_TOTAL_MISMATCH'; end if;
   update public.orders set status='بانتظار الدفع' where id=oid and customer_id=cid::text;
   if not found then raise exception 'PAYMENT_P5_CAMPAIGN_WAITING_TRANSITION_FAILED'; end if;
   insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),oid);
   update public.orders set status='تم التسديد' where id=oid and customer_id=cid::text;
   if not found then raise exception 'PAYMENT_P5_CAMPAIGN_PAID_TRANSITION_FAILED'; end if;
   delete from private.kinto_paid_transition_permits_v1 where transaction_id=txid_current() and order_id=oid;
   delete from private.kinto_payment_finalize_permits_p5 where transaction_id=txid_current() and attempt_id=p_attempt_id;
   update private.kinto_payment_attempts_p4 set status='succeeded',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='consumed',released_at=clock_timestamp(),release_reason='p5_campaign_finalized' where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='consumed',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status='paid',order_ids=array[oid],updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','paid','order_ids',array[oid],'checkout',checkout,'real_collection_allowed',false);
 exception when others then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',false,'kp_number',p.kp_number,'status','reconciliation_required','error',sqlerrm,'hold_retained',true);
 end;
end;$campaign_simulate$;
notify pgrst,'reload schema';
commit;
