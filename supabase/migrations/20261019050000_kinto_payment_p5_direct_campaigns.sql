-- Payment-P5 direct campaign checkout. No campaign order is written until the
-- server simulator confirms success. Stock and campaign quota are held via P4
-- and this private ledger; G20/G5/V47 remain the canonical paid-order path.
begin;

create table if not exists private.kinto_payment_campaign_holds_p5 (
  attempt_id uuid primary key references private.kinto_payments_p5(attempt_id) on delete restrict,
  campaign_id uuid not null references public.kinto_deals_v1_campaigns(id) on delete restrict,
  customer_id text not null,
  status text not null check(status in ('active','consumed','released','reconciliation_required','expired')),
  expires_at timestamptz not null,
  request_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists kinto_payment_campaign_holds_p5_quota_idx
  on private.kinto_payment_campaign_holds_p5(campaign_id,status,expires_at);
alter table private.kinto_payment_campaign_holds_p5 enable row level security;
revoke all on private.kinto_payment_campaign_holds_p5 from public,anon,authenticated;

create or replace function public.kinto_payment_p5_campaign_reserve_v1(
  p_session_token text,p_idempotency_key text,p_campaign_id uuid,p_items jsonb,
  p_coupon_points jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $campaign_reserve$
declare
  cid uuid; c public.kinto_deals_v1_campaigns%rowtype; latest public.kinto_deals_v1_submissions%rowtype;
  q jsonb; gift jsonb; hold_lines jsonb; a jsonb; attempt uuid; kp text; amount numeric;
  max_total integer; used_total integer; used_customer integer; item jsonb; old_status text; old_campaign uuid; old_q jsonb; old_hash text;
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
    select p.attempt_id,p.kp_number,p.status,p.quote_snapshot,p.quote_snapshot->>'campaign_id',h.request_hash
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
  if c.gift_product_id is not null then gift:=private.kinto_deals_v1_gift_line_g5e(c.id,c.store_id); else gift:=null; end if;
  hold_lines:=case when gift is null then q->'lines' else (q->'lines')||jsonb_build_array(gift) end;

  select max_total_redemptions into max_total from public.kinto_deals_v1_campaigns where id=c.id;
  select count(*)::integer into used_total from public.kinto_deals_v1_redemptions r where r.campaign_id=c.id and r.state in ('pending','confirmed');
  select used_total+count(*)::integer into used_total from private.kinto_payment_campaign_holds_p5 h
    where h.campaign_id=c.id and (h.status='reconciliation_required' or (h.status='active' and h.expires_at>clock_timestamp()));
  select count(*)::integer into used_customer from public.kinto_deals_v1_redemptions r where r.campaign_id=c.id and r.customer_id=cid and r.state in ('pending','confirmed');
  select used_customer+count(*)::integer into used_customer from private.kinto_payment_campaign_holds_p5 h
    where h.campaign_id=c.id and h.customer_id=cid and (h.status='reconciliation_required' or (h.status='active' and h.expires_at>clock_timestamp()));
  if (max_total is not null and used_total>=max_total) or used_customer>=c.max_uses_per_customer then
    raise exception 'DEALS_ALLOCATION_LIMIT_REACHED' using errcode='P0001';
  end if;

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
revoke all on function public.kinto_payment_p5_campaign_reserve_v1(text,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_campaign_reserve_v1(text,text,uuid,jsonb,jsonb) to service_role;

create or replace function public.kinto_payment_p5_campaign_simulate_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $campaign_simulate$
declare cid uuid;p private.kinto_payments_p5%rowtype;a private.kinto_payment_attempts_p4%rowtype;h private.kinto_stock_holds_p4%rowtype;
 ch private.kinto_payment_campaign_holds_p5%rowtype;ev text;v_outcome text;checkout jsonb;oid uuid;ord public.orders%rowtype;
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
revoke all on function public.kinto_payment_p5_campaign_simulate_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_campaign_simulate_v1(text,uuid,text,uuid,jsonb) to service_role;

-- Dispatch by the persisted payment kind, never by a browser-supplied label.
create or replace function public.kinto_payment_p5_simulate_dispatch_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $dispatch$
declare cid uuid; kind text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token);
 select payment_kind into kind from private.kinto_payments_p5 where attempt_id=p_attempt_id and customer_id=cid::text;
 if not found then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if kind='campaign' then return public.kinto_payment_p5_campaign_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping); end if;
 return public.kinto_payment_p5_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping);
end;$dispatch$;
revoke all on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
