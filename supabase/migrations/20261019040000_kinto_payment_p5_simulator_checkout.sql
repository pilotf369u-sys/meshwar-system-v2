-- Payment-P5: customer checkout through a no-charge server simulator.
-- Additive ledger/read APIs. P4 remains the stock hold implementation and
-- V161/V310/V47 remain the canonical order, coupon, and paid-stock engines.
begin;

create sequence if not exists private.kinto_payment_kp_number_p5;

create table if not exists private.kinto_payment_runtime_p5 (
  singleton boolean primary key default true check (singleton),
  simulator_enabled boolean not null default false,
  real_collection_allowed boolean not null default false check (real_collection_allowed=false),
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.kinto_payment_runtime_p5(singleton) values(true) on conflict do nothing;

create table if not exists private.kinto_payments_p5 (
  attempt_id uuid primary key references private.kinto_payment_attempts_p4(id) on delete restrict,
  kp_number text not null unique,
  customer_id text not null,
  payment_kind text not null default 'cart' check(payment_kind in ('cart','campaign')),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  amount numeric(18,3) not null check(amount>0),
  status text not null default 'reserved' check(status in ('reserved','pending','paid','failed','cancelled','unknown','expired','reconciliation_required')),
  order_ids uuid[] not null default '{}',
  quote_snapshot jsonb not null check(jsonb_typeof(quote_snapshot)='object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists kinto_payments_p5_customer_date_idx on private.kinto_payments_p5(customer_id,created_at desc,attempt_id desc);

create table if not exists private.kinto_payment_coupon_holds_p5 (
  attempt_id uuid not null references private.kinto_payments_p5(attempt_id) on delete restrict,
  coupon_id uuid not null references public.kinto_loyalty_coupons(id) on delete restrict,
  store_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(attempt_id,coupon_id),
  unique(coupon_id)
);
create index if not exists kinto_payment_coupon_holds_p5_store_idx on private.kinto_payment_coupon_holds_p5(store_id,attempt_id);

create table if not exists private.kinto_payment_finalize_permits_p5 (
  transaction_id bigint not null,
  attempt_id uuid not null references private.kinto_payments_p5(attempt_id) on delete restrict,
  customer_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(transaction_id,attempt_id)
);

alter table private.kinto_payment_runtime_p5 enable row level security;
alter table private.kinto_payments_p5 enable row level security;
alter table private.kinto_payment_coupon_holds_p5 enable row level security;
alter table private.kinto_payment_finalize_permits_p5 enable row level security;
revoke all on private.kinto_payment_runtime_p5,private.kinto_payments_p5,
  private.kinto_payment_coupon_holds_p5,private.kinto_payment_finalize_permits_p5 from public,anon,authenticated;
revoke all on sequence private.kinto_payment_kp_number_p5 from public,anon,authenticated;

create or replace function private.kinto_payment_p5_quote_v1(p_customer uuid,p_items jsonb,p_coupon_points jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $quote$
declare v_lines jsonb; v_currencies jsonb; v_currency_count integer; v_total numeric; v_coupon_total numeric:=0; v_currency text; v_store record; v_points bigint; v_coupon_count integer; v_coupon_unit bigint; v_need integer; v_coupons jsonb:='{}'::jsonb;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100
   or jsonb_typeof(coalesce(p_coupon_points,'{}'::jsonb)) is distinct from 'object' then raise exception 'PAYMENT_P5_INVALID_CART' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x(item) where private.v94_uuid(x.item->>'store_id') is null
   or private.v94_uuid(x.item->>'product_id') is null or private.v94_numeric(x.item->>'quantity',0)<>trunc(private.v94_numeric(x.item->>'quantity',0))
   or private.v94_numeric(x.item->>'quantity',0)<1 or private.v94_numeric(x.item->>'quantity',0)>1000
   or jsonb_typeof(coalesce(x.item->'selected_options','{}'::jsonb)) is distinct from 'object') then raise exception 'PAYMENT_P5_INVALID_LINE' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x(item) join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id')
      and p.store_id=private.v94_uuid(x.item->>'store_id') where not private.kinto_payment_options_valid_p4(p.options,coalesce(x.item->'selected_options','{}'::jsonb)))
   or exists(select 1 from jsonb_array_elements(p_items) x(item) left join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id')
      and p.store_id=private.v94_uuid(x.item->>'store_id') where p.id is null) then raise exception 'PAYMENT_P5_INVALID_VARIANT' using errcode='22023'; end if;

 with priced as (
  select s.id store_id,s.store_name,upper(coalesce(nullif(s.exchange_target_currency,''),nullif(s.default_currency,''),'IQD')) currency,
   p.id product_id,p.product_name,p.image_url,coalesce(x.item->'selected_options','{}'::jsonb) selected_options,
   private.v94_numeric(x.item->>'quantity',1)::integer quantity,
   ceil(coalesce(p.discount_price,p.base_price)::numeric/(1-coalesce(s.commission_rate,10)::numeric/100)) customer_price_usd,
   ceil((ceil(coalesce(p.discount_price,p.base_price)::numeric/(1-coalesce(s.commission_rate,10)::numeric/100))*s.exchange_rate::numeric)/1000)*1000 unit_price_local
  from jsonb_array_elements(p_items) x(item) join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id') and p.store_id=private.v94_uuid(x.item->>'store_id')
  join public.local_stores s on s.id=p.store_id where lower(coalesce(s.status,''))='active' and not coalesce(p.is_out_of_stock,false)
    and coalesce(s.commission_rate,10)>=0 and coalesce(s.commission_rate,10)<100 and coalesce(s.exchange_rate,0)>0
    and coalesce(p.discount_price,p.base_price)>=0
 )
 select jsonb_agg(jsonb_build_object('store_id',store_id,'store_name',store_name,'product_id',product_id,'product_name',product_name,
       'product_image',image_url,'selected_options',selected_options,'quantity',quantity,'unit_price_local',unit_price_local,
       'line_total_local',unit_price_local*quantity,'currency',currency,'pricing_snapshot',jsonb_build_object('pricing_version','iqd_ceil_1000_v1',
       'customer_price_usd',customer_price_usd)) order by store_id,product_id),
       jsonb_agg(distinct currency),sum(unit_price_local*quantity)
 into v_lines,v_currencies,v_total from priced;
 if v_lines is null or jsonb_array_length(v_lines)<>jsonb_array_length(p_items) then raise exception 'PAYMENT_P5_PRODUCT_UNAVAILABLE' using errcode='P0001'; end if;
 select count(distinct upper(coalesce(nullif(s.exchange_target_currency,''),nullif(s.default_currency,''),'IQD')))
 into v_currency_count from jsonb_array_elements(p_items) x(item) join public.local_products p on p.id=(x.item->>'product_id')::uuid
 join public.local_stores s on s.id=p.store_id;
 if v_currency_count<>1 then raise exception 'PAYMENT_P5_MIXED_CURRENCY_MANUAL_REQUIRED' using errcode='P0001'; end if;
 v_currency:=v_currencies->>0;
 if exists(select 1 from jsonb_object_keys(coalesce(p_coupon_points,'{}'::jsonb)) k where private.v94_uuid(k) is null) then raise exception 'PAYMENT_P5_COUPON_STORE_INVALID'; end if;
 for v_store in select distinct (x->>'store_id')::uuid store_id from jsonb_array_elements(v_lines) x loop
   v_points:=coalesce((p_coupon_points->>v_store.store_id::text)::bigint,0);
   if v_points not in (0,1000,3000,5000) then raise exception 'PAYMENT_P5_COUPON_TIER_INVALID'; end if;
   if v_points>0 then
     if v_currency<>'IQD' then raise exception 'PAYMENT_P5_COUPON_CURRENCY_INVALID'; end if;
     if v_points>floor((select sum((x->>'line_total_local')::numeric) from jsonb_array_elements(v_lines) x where (x->>'store_id')::uuid=v_store.store_id)*0.10) then raise exception 'PAYMENT_P5_COUPON_CAP'; end if;
     select coupon_unit into v_coupon_unit from public.kinto_loyalty_settings where id=1;
     if coalesce(v_coupon_unit,0)<1 then raise exception 'PAYMENT_P5_COUPON_SETTINGS_INVALID'; end if;
     v_need:=(v_points/v_coupon_unit)::integer;
     if v_points%v_coupon_unit<>0 then raise exception 'PAYMENT_P5_COUPON_TIER_INVALID'; end if;
     select count(*) into v_coupon_count from public.kinto_loyalty_coupons q where q.customer_id=p_customer::text
       and q.currency=v_currency and q.status='active' and q.expires_at>now()
       and not exists(select 1 from private.kinto_payment_coupon_holds_p5 h where h.coupon_id=q.id)
       and ((q.campaign_id is null and q.store_id=v_store.store_id::text) or (q.campaign_id is not null and exists(
         select 1 from public.kinto_campaign_stores cs join public.kinto_campaigns ca on ca.id=cs.campaign_id
         where cs.campaign_id=q.campaign_id and cs.store_id=v_store.store_id::text and ca.status<>'cancelled')));
     if v_coupon_count<v_need then raise exception 'PAYMENT_P5_COUPON_NOT_AVAILABLE' using errcode='P0001'; end if;
     v_coupon_total:=v_coupon_total+v_points;
   end if;
   v_coupons:=v_coupons||jsonb_build_object(v_store.store_id::text,v_points);
 end loop;
 return jsonb_build_object('currency',v_currency,'amount',v_total-v_coupon_total,'lines',v_lines,'coupon_points',v_coupons,
   'input_items',p_items,'shipping_included',false,'shipping_note','الشحن غير مشمول ويُحدد لاحقاً');
end;
$quote$;
revoke all on function private.kinto_payment_p5_quote_v1(uuid,jsonb,jsonb) from public,anon,authenticated;

-- Browser/cart mode probe derives customer identity exclusively from the session token.
create or replace function public.kinto_payment_p5_mode_read_v1(p_session_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $mode$
declare cid uuid; r record;
begin
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 select g.payment_mode,p.effective_mode,p.transition_state,p.electronic_admission_ready,s.emergency_stop,
   coalesce(rt.simulator_enabled,false) simulator_enabled,
   (s.selected_provider_key='kinto-simulator' and exists(select 1 from public.kinto_payment_providers_p2 pr
      where pr.provider_key=s.selected_provider_key and pr.enabled and pr.test_only and not pr.real_collection_allowed)) simulator_provider_ready into r
 from public.kinto_payment_settings_g16 g cross join private.kinto_payment_runtime_p4 p
 cross join public.kinto_payment_runtime_p2 s cross join private.kinto_payment_runtime_p5 rt
 where g.singleton and p.singleton and s.singleton and rt.singleton;
 return jsonb_build_object('effective_mode',r.effective_mode,'transition_state',r.transition_state,'electronic_admission_ready',r.electronic_admission_ready,
   'emergency_stop',r.emergency_stop,'simulator_enabled',r.simulator_enabled,'simulator_provider_ready',r.simulator_provider_ready,'real_collection_allowed',false,
   'checkout_available',r.payment_mode='electronic' and r.effective_mode='electronic' and r.transition_state='stable'
     and r.electronic_admission_ready and not r.emergency_stop and r.simulator_enabled and r.simulator_provider_ready);
end;$mode$;
revoke all on function public.kinto_payment_p5_mode_read_v1(text) from public;
grant execute on function public.kinto_payment_p5_mode_read_v1(text) to anon,authenticated;

-- Customer-side payment history is session-scoped; callers cannot pass customer_id.
create or replace function public.kinto_payments_p5_list_v1(p_session_token text,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $list$
declare cid uuid; v_page integer; v_total bigint; v_rows jsonb;
begin
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 v_page:=greatest(1,coalesce(p_page,1));
 select count(*) into v_total from private.kinto_payments_p5 p where p.customer_id=cid::text;
 select coalesce(jsonb_agg(jsonb_build_object('kp_number',p.kp_number,'created_at',p.created_at,'amount',p.amount,'currency',p.currency,
   'status',p.status,'orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'order_code',o.order_code,'currency',o.currency,
     'invoice',to_jsonb(o)) order by o.created_at,o.id) from public.orders o where o.id=any(p.order_ids) and o.customer_id=cid::text),'[]'::jsonb))
   order by p.created_at desc,p.attempt_id desc),'[]'::jsonb) into v_rows from (
   select * from private.kinto_payments_p5 where customer_id=cid::text order by created_at desc,attempt_id desc limit 10 offset (v_page-1)*10
 ) p;
 return jsonb_build_object('page',v_page,'page_size',10,'total',v_total,'pages',ceil(v_total::numeric/10),'payments',v_rows);
end;$list$;
revoke all on function public.kinto_payments_p5_list_v1(text,integer) from public;
grant execute on function public.kinto_payments_p5_list_v1(text,integer) to anon,authenticated;

-- No customer can inject a GUC to pass these gates. Only a private, transaction-bound finalizer row permits P5 inserts/paid transitions.
create or replace function private.kinto_payment_hold_gate_p4()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $gate$
declare d jsonb; ctl private.kinto_payment_runtime_p4%rowtype;
begin
 d:=private.v94_jsonb_object(to_jsonb(new.details));
 if coalesce(d->>'source','') not in ('local_store','local_cart_bundle') and coalesce(d->>'checkout_contract','')<>'independent_vendor_orders' then return new; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for share;
 if not found or ctl.transition_state<>'stable' then raise exception 'PAYMENT_P4_MODE_TRANSITION_IN_PROGRESS' using errcode='55000'; end if;
 if ctl.effective_mode='manual' then return new; end if;
 if exists(select 1 from private.kinto_payment_finalize_permits_p5 p where p.transaction_id=txid_current() and p.customer_id=new.customer_id) then return new; end if;
 raise exception 'PAYMENT_P4_MANUAL_ORDER_PATH_NOT_ACTIVE' using errcode='55000';
end;$gate$;
revoke all on function private.kinto_payment_hold_gate_p4() from public,anon,authenticated;

create or replace function private.kinto_payment_paid_mode_gate_p4()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $paid$
declare d jsonb; ctl private.kinto_payment_runtime_p4%rowtype;
begin
 if new.status is not distinct from old.status or new.status<>'تم التسديد' then return new; end if;
 d:=private.v94_jsonb_object(to_jsonb(new.details));
 if coalesce(d->>'source','') not in ('local_store','local_cart_bundle') and coalesce(d->>'checkout_contract','')<>'independent_vendor_orders' then return new; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for share;
 if not found or ctl.transition_state<>'stable' then raise exception 'PAYMENT_P4_MODE_TRANSITION_IN_PROGRESS'; end if;
 if ctl.effective_mode='manual' or exists(select 1 from private.kinto_payment_finalize_permits_p5 p where p.transaction_id=txid_current() and p.customer_id=new.customer_id) then return new; end if;
 raise exception 'PAYMENT_P4_MANUAL_PAYMENT_PATH_NOT_ACTIVE' using errcode='55000';
end;$paid$;
revoke all on function private.kinto_payment_paid_mode_gate_p4() from public,anon,authenticated;

create or replace function public.kinto_payment_p5_quote_v1(p_session_token text,p_items jsonb,p_coupon_points jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $public_quote$
declare cid uuid; q jsonb;
begin
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 q:=private.kinto_payment_p5_quote_v1(cid,p_items,p_coupon_points);
 return q||jsonb_build_object('customer_id',null,'shipping_included',false,'shipping_note','الشحن غير مشمول ويُحدد لاحقاً');
end;$public_quote$;
revoke all on function public.kinto_payment_p5_quote_v1(text,jsonb,jsonb) from public;
grant execute on function public.kinto_payment_p5_quote_v1(text,jsonb,jsonb) to anon,authenticated;

create or replace function public.kinto_payment_p5_reserve_v1(p_session_token text,p_idempotency_key text,p_items jsonb,p_coupon_points jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $p5reserve$
declare cid uuid; q jsonb; a jsonb; old_q jsonb; attempt uuid; kp text; old_status text; store_row record; pts bigint; unit bigint; need integer; c record; got integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':'||p_idempotency_key,0));
 if exists(select 1 from private.kinto_payment_attempts_p4 old where old.customer_id=cid::text and old.idempotency_key=p_idempotency_key) then
   select p.attempt_id,p.kp_number,p.status,p.quote_snapshot into attempt,kp,old_status,old_q
     from private.kinto_payments_p5 p join private.kinto_payment_attempts_p4 x on x.id=p.attempt_id
     where x.customer_id=cid::text and x.idempotency_key=p_idempotency_key;
   return jsonb_build_object('ok',true,'attempt_id',attempt,'kp_number',kp,'status',old_status,'reused',true,'quote',old_q);
 end if;
 if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
   or not exists(select 1 from private.kinto_payment_runtime_p4 where singleton and electronic_admission_ready and effective_mode='electronic' and transition_state='stable')
   or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then
   raise exception 'PAYMENT_P5_NOT_AVAILABLE' using errcode='55000'; end if;
 q:=private.kinto_payment_p5_quote_v1(cid,p_items,p_coupon_points);
 a:=public.kinto_payment_attempt_reserve_p4(cid,p_idempotency_key,q->>'currency',(q->>'amount')::numeric,
   q||jsonb_build_object('lines',q->'lines'),q->'lines');
 attempt:=(a->>'attempt_id')::uuid;
 kp:='KP-'||lpad(nextval('private.kinto_payment_kp_number_p5')::text,9,'0');
 insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,currency,amount,status,quote_snapshot)
 values(attempt,kp,cid::text,q->>'currency',(q->>'amount')::numeric,'reserved',q)
 on conflict(attempt_id) do update set updated_at=clock_timestamp()
 returning kp_number into kp;
 select coupon_unit into unit from public.kinto_loyalty_settings where id=1;
 for store_row in select distinct (x->>'store_id')::uuid store_id from jsonb_array_elements(q->'lines') x loop
   pts:=coalesce((q->'coupon_points'->>store_row.store_id::text)::bigint,0);
   if pts>0 then
     need:=(pts/unit)::integer; got:=0;
     for c in select x.id from public.kinto_loyalty_coupons x where x.customer_id=cid::text and x.currency=q->>'currency'
       and x.status='active' and x.expires_at>now() and not exists(select 1 from private.kinto_payment_coupon_holds_p5 h where h.coupon_id=x.id)
       and ((x.campaign_id is null and x.store_id=store_row.store_id::text) or (x.campaign_id is not null and exists(
         select 1 from public.kinto_campaign_stores cs join public.kinto_campaigns ca on ca.id=cs.campaign_id where cs.campaign_id=x.campaign_id
           and cs.store_id=store_row.store_id::text and ca.status<>'cancelled')))
       order by x.expires_at,x.issued_at for update of x skip locked limit need loop
       insert into private.kinto_payment_coupon_holds_p5(attempt_id,coupon_id,store_id) values(attempt,c.id,store_row.store_id::text);
       got:=got+1;
     end loop;
     if got<>need then raise exception 'PAYMENT_P5_COUPON_RACE' using errcode='P0001'; end if;
   end if;
 end loop;
 return jsonb_build_object('ok',true,'attempt_id',attempt,'kp_number',kp,'status','reserved','expires_at',a->>'expires_at','reused',false,'quote',q);
end;$p5reserve$;
revoke all on function public.kinto_payment_p5_reserve_v1(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_reserve_v1(text,text,jsonb,jsonb) to service_role;

create or replace function public.kinto_payment_p5_start_v1(p_session_token text,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $start$
declare cid uuid; p private.kinto_payments_p5%rowtype; ref text; result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token); select * into p from private.kinto_payments_p5 where attempt_id=p_attempt_id for update;
 if not found or p.customer_id<>cid::text then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if p.status='paid' then return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','paid','orders',p.order_ids); end if;
 ref:='sim-'||p_attempt_id::text;
 result:=public.kinto_payment_attempt_mark_pending_p4(p_attempt_id,ref);
 update private.kinto_payments_p5 set status='pending',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
 return jsonb_build_object('ok',true,'attempt_id',p_attempt_id,'kp_number',p.kp_number,'status','pending','expires_at',(select expires_at from private.kinto_payment_attempts_p4 where id=p_attempt_id),'real_collection_allowed',false);
end;$start$;
revoke all on function public.kinto_payment_p5_start_v1(text,uuid) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_start_v1(text,uuid) to service_role;

create or replace function public.kinto_payment_p5_simulate_v1(p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $simulate$
declare cid uuid; p private.kinto_payments_p5%rowtype; a private.kinto_payment_attempts_p4%rowtype; h private.kinto_stock_holds_p4%rowtype;
 v_outcome text; ev text; result jsonb; checkout jsonb; oid uuid; o record; cp jsonb; points bigint; paid_ids uuid[]:='{}'; coupon record;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token);
 if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
   or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then raise exception 'PAYMENT_P5_SIMULATOR_CLOSED' using errcode='55000'; end if;
 if p_scenario not in ('success','failure','cancel','unknown','disconnect') or p_event_key is null then raise exception 'PAYMENT_P5_SCENARIO_INVALID' using errcode='22023'; end if;
 select * into p from private.kinto_payments_p5 where attempt_id=p_attempt_id for update;
 if not found or p.customer_id<>cid::text then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if p.status='paid' then return jsonb_build_object('ok',true,'duplicate',true,'kp_number',p.kp_number,'status','paid','order_ids',p.order_ids); end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=p_attempt_id for update;
 if a.status<>'pending' or h.status<>'active' then raise exception 'PAYMENT_P5_ATTEMPT_NOT_PENDING' using errcode='55000'; end if;
 if h.expires_at<=clock_timestamp() and p_scenario in ('success') then raise exception 'PAYMENT_P5_HOLD_EXPIRED' using errcode='55000'; end if;
 v_outcome:=case when p_scenario='success' then 'succeeded' when p_scenario='failure' then 'failed' when p_scenario='cancel' then 'cancelled' else 'unknown' end;
 ev:='p5:'||p_attempt_id::text||':'||p_event_key::text;
 insert into private.kinto_payment_events_p4(attempt_id,provider_key,provider_event_id,outcome,evidence_digest)
 values(p_attempt_id,a.provider_key,ev,v_outcome,'server-simulator-v1') on conflict(provider_key,provider_event_id) do nothing;
 if not found and not exists(select 1 from private.kinto_payment_events_p4 where provider_key=a.provider_key and provider_event_id=ev and attempt_id=p_attempt_id and outcome=v_outcome) then
   raise exception 'PAYMENT_P5_EVENT_REPLAY_MISMATCH' using errcode='23505'; end if;
 if v_outcome in ('failed','cancelled') then
   update private.kinto_payment_attempts_p4 set status=v_outcome,updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='released',released_at=clock_timestamp(),release_reason='server_simulator_'||v_outcome where id=h.id;
   delete from private.kinto_payment_coupon_holds_p5 where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status=v_outcome,updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status',v_outcome,'real_collection_allowed',false);
 elsif v_outcome='unknown' then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','reconciliation_required','message','جارٍ التحقق','hold_retained',true);
 end if;
 begin
   insert into private.kinto_payment_finalize_permits_p5(transaction_id,attempt_id,customer_id) values(txid_current(),p_attempt_id,cid::text);
   checkout:=public.kinto_checkout_session_v1(p_session_token,coalesce(p_shipping,'{}'::jsonb),p.quote_snapshot->'input_items');
   if jsonb_array_length(coalesce(checkout->'orders','[]'::jsonb))<1 then raise exception 'PAYMENT_P5_CHECKOUT_EMPTY'; end if;
   for o in select (x->>'id')::uuid id,x->>'store_id' store_id from jsonb_array_elements(checkout->'orders') x loop
     oid:=o.id; update public.orders set status='بانتظار الدفع' where id=oid;
     points:=coalesce((p.quote_snapshot->'coupon_points'->>o.store_id)::bigint,0);
     if points>0 then
       perform 1 from public.kinto_loyalty_coupons q join private.kinto_payment_coupon_holds_p5 ch on ch.coupon_id=q.id
         where ch.attempt_id=p_attempt_id and ch.store_id=o.store_id for update of q;
       delete from private.kinto_payment_coupon_holds_p5 where attempt_id=p_attempt_id and store_id=o.store_id;
       perform public.customer_apply_coupon_v310(p_session_token,oid::text,points);
     end if;
     insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),oid);
     paid_ids:=array_append(paid_ids,oid);
   end loop;
   update public.orders set status='تم التسديد' where id=any(paid_ids) and customer_id=cid::text;
   if cardinality(paid_ids)<>jsonb_array_length(checkout->'orders') then raise exception 'PAYMENT_P5_FINALIZE_ORDER_MISMATCH'; end if;
   delete from private.kinto_paid_transition_permits_v1 where transaction_id=txid_current() and order_id=any(paid_ids);
   delete from private.kinto_payment_finalize_permits_p5 where transaction_id=txid_current() and attempt_id=p_attempt_id;
   update private.kinto_payment_attempts_p4 set status='succeeded',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='consumed',released_at=clock_timestamp(),release_reason='p5_simulator_finalized' where id=h.id;
   update private.kinto_payments_p5 set status='paid',order_ids=paid_ids,updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','paid','order_ids',paid_ids,'checkout',checkout,'real_collection_allowed',false);
 exception when others then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',false,'kp_number',p.kp_number,'status','reconciliation_required','error',sqlerrm,'hold_retained',true);
 end;
end;$simulate$;
revoke all on function public.kinto_payment_p5_simulate_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_simulate_v1(text,uuid,text,uuid,jsonb) to service_role;

create or replace function public.kinto_payment_p5_status_v1(p_session_token text,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $status$
declare cid uuid; p private.kinto_payments_p5%rowtype; a private.kinto_payment_attempts_p4%rowtype;
begin
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 select * into p from private.kinto_payments_p5 where attempt_id=p_attempt_id and customer_id=cid::text;
 if not found then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id;
 return jsonb_build_object('kp_number',p.kp_number,'status',p.status,'amount',p.amount,'currency',p.currency,'order_ids',p.order_ids,
   'expires_at',a.expires_at,'real_collection_allowed',false);
end;$status$;
revoke all on function public.kinto_payment_p5_status_v1(text,uuid) from public;
grant execute on function public.kinto_payment_p5_status_v1(text,uuid) to anon,authenticated;

create or replace function public.kinto_payment_attempt_reserve_p4(
 p_customer_id uuid,
 p_idempotency_key text,
 p_currency text,
 p_amount numeric,
 p_quote_snapshot jsonb,
 p_lines jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $reserve$
declare ctl private.kinto_payment_runtime_p4%rowtype; runtime_p2 public.kinto_payment_runtime_p2%rowtype;
        provider public.kinto_payment_providers_p2%rowtype;
        selected_provider text; v_attempt private.kinto_payment_attempts_p4%rowtype; v_hold private.kinto_stock_holds_p4%rowtype;
        v_product_id uuid; p record; v_held integer; v_stock integer; v_variant record; v_variant_stock jsonb;
        v_matrix record; v_matrix_stock jsonb; v_expiry timestamptz:=clock_timestamp()+interval '15 minutes';
        v_lines jsonb:=p_lines; v_existing private.kinto_payment_attempts_p4%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_customer_id is null or p_amount is null or p_amount<=0 or p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$'
   or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9_-]{16,128}$'
   or jsonb_typeof(p_quote_snapshot) is distinct from 'object'
   or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines)<1 or jsonb_array_length(v_lines)>100 then
   raise exception 'PAYMENT_P4_INVALID_INPUT' using errcode='22023'; end if;
 if not exists(select 1 from public.customers c where c.id=p_customer_id) then raise exception 'PAYMENT_P4_CUSTOMER_NOT_FOUND' using errcode='P0002'; end if;
 if exists(select 1 from jsonb_array_elements(v_lines) x(item)
   where private.v94_uuid(x.item->>'store_id') is null or private.v94_uuid(x.item->>'product_id') is null
     or private.v94_numeric(x.item->>'quantity',0)<>trunc(private.v94_numeric(x.item->>'quantity',0))
     or private.v94_numeric(x.item->>'quantity',0)<1 or private.v94_numeric(x.item->>'quantity',0)>1000
     or jsonb_typeof(coalesce(x.item->'selected_options','{}'::jsonb)) is distinct from 'object'
     or not exists(select 1 from public.local_products lp where lp.id=private.v94_uuid(x.item->>'product_id')
        and lp.store_id=private.v94_uuid(x.item->>'store_id'))) then
   raise exception 'PAYMENT_P4_INVALID_LINE' using errcode='22023'; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for share;
 if not found or ctl.electronic_admission_ready is not true or ctl.effective_mode<>'electronic' or ctl.transition_state<>'stable' then
   raise exception 'PAYMENT_P4_ELECTRONIC_INTAKE_CLOSED' using errcode='55000'; end if;
 select * into runtime_p2 from public.kinto_payment_runtime_p2 where singleton=true for share;
 if not found or runtime_p2.emergency_stop then raise exception 'NEW_PAYMENTS_EMERGENCY_STOPPED' using errcode='55000'; end if;
 select selected_provider_key into selected_provider from public.kinto_payment_runtime_p2 where singleton=true;
 select * into provider from public.kinto_payment_providers_p2 where provider_key=selected_provider for share;
 if selected_provider is null or not found or provider.enabled is not true or provider.test_only is distinct from true or provider.real_collection_allowed is distinct from false or selected_provider<>'kinto-simulator' or not exists(select 1 from private.kinto_payment_runtime_p5 where singleton=true and simulator_enabled=true and real_collection_allowed=false) then
   raise exception 'PAYMENT_P4_PROVIDER_NOT_SELECTED' using errcode='55000'; end if;
 if upper(p_currency)<>upper(coalesce(p_quote_snapshot->>'currency',''))
   or p_amount is distinct from (p_quote_snapshot->>'amount')::numeric
   or p_quote_snapshot->'lines' is distinct from v_lines then
   raise exception 'PAYMENT_P4_SERVER_QUOTE_MISMATCH' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text||':'||p_idempotency_key,0));
 select * into v_existing from private.kinto_payment_attempts_p4 where customer_id=p_customer_id::text and idempotency_key=p_idempotency_key for update;
 if found then
   if v_existing.currency<>upper(p_currency) or v_existing.amount<>p_amount or v_existing.quote_snapshot is distinct from p_quote_snapshot then
     raise exception 'PAYMENT_P4_IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
   select * into v_hold from private.kinto_stock_holds_p4 where attempt_id=v_existing.id;
   return jsonb_build_object('attempt_id',v_existing.id,'hold_id',v_hold.id,'status',v_existing.status,'expires_at',v_existing.expires_at,'provider_key',v_existing.provider_key,'reused',true);
 end if;
 -- All callers lock products in the same UUID order before counting holds.
 for v_product_id in select distinct (item->>'product_id')::uuid from jsonb_array_elements(v_lines) q(item) order by 1 loop
   perform 1 from public.local_products p0 where p0.id=v_product_id for update;
   if not found then raise exception 'PAYMENT_P4_PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
 end loop;
 for p in select p0.id,p0.stock_quantity,p0.is_out_of_stock,coalesce(p0.options,'{}'::jsonb) options,
       sum((x.item->>'quantity')::integer)::integer requested
      from jsonb_array_elements(v_lines) x(item) join public.local_products p0 on p0.id=(x.item->>'product_id')::uuid
     group by p0.id,p0.stock_quantity,p0.is_out_of_stock,p0.options order by p0.id loop
   if coalesce(p.is_out_of_stock,false) then raise exception 'PAYMENT_P4_PRODUCT_UNAVAILABLE'; end if;
   if exists(select 1 from jsonb_array_elements(v_lines) x(item) where (x.item->>'product_id')::uuid=p.id
       and not private.kinto_payment_options_valid_p4(p.options,coalesce(x.item->'selected_options','{}'::jsonb))) then
     raise exception 'PAYMENT_P4_INVALID_VARIANT'; end if;
   if p.stock_quantity is not null then
     select coalesce(sum(l.quantity),0)::integer into v_held from private.kinto_stock_hold_lines_p4 l
       join private.kinto_stock_holds_p4 h on h.id=l.hold_id
       join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
      where l.product_id=p.id and h.status in ('active','reconciliation_required')
        and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
          or a.status in ('pending','succeeded','reconciliation_required'));
     if p.stock_quantity-v_held<p.requested then raise exception 'PAYMENT_P4_INSUFFICIENT_TOTAL_STOCK' using errcode='P0001'; end if;
   end if;
 end loop;
 for v_variant in select (x.item->>'product_id')::uuid product_id,d.dimension,d.choice,
      sum((x.item->>'quantity')::integer)::integer requested
     from jsonb_array_elements(v_lines) x(item)
     cross join lateral (values('color'::text,nullif(btrim(x.item->'selected_options'->>'color'),'')),('size',nullif(btrim(x.item->'selected_options'->>'size'),'')),('volume',nullif(btrim(x.item->'selected_options'->>'volume'),''))) d(dimension,choice)
     where d.choice is not null group by 1,2,3 order by 1,2,3 loop
   select coalesce(p0.options->'variant_stock'->v_variant.dimension,p0.options->'variant_stock'->(v_variant.dimension||'s')) into v_variant_stock from public.local_products p0 where p0.id=v_variant.product_id;
   if jsonb_typeof(v_variant_stock)='object' and v_variant_stock ? v_variant.choice then
     if coalesce(v_variant_stock->>v_variant.choice,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_P4_VARIANT_STOCK_INVALID'; end if;
     v_stock:=(v_variant_stock->>v_variant.choice)::integer;
     select coalesce(sum(l.quantity),0)::integer into v_held from private.kinto_stock_hold_lines_p4 l
       join private.kinto_stock_holds_p4 h on h.id=l.hold_id
       join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
      where l.product_id=v_variant.product_id and h.status in ('active','reconciliation_required')
       and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
         or a.status in ('pending','succeeded','reconciliation_required'))
       and coalesce(l.selected_options->>v_variant.dimension,'')=v_variant.choice;
     if v_stock-v_held<v_variant.requested then raise exception 'PAYMENT_P4_INSUFFICIENT_VARIANT_STOCK' using errcode='P0001'; end if;
   end if;
 end loop;
 for v_matrix in select (item->>'product_id')::uuid product_id,public.meshwar_matrix_stock_key(coalesce(item->'selected_options','{}'::jsonb)) matrix_key,
       sum((item->>'quantity')::integer)::integer requested from jsonb_array_elements(v_lines) x(item) group by 1,2 order by 1,2 loop
   select coalesce(p0.options->'matrix_stock','{}'::jsonb) into v_matrix_stock from public.local_products p0 where p0.id=v_matrix.product_id;
   if jsonb_typeof(v_matrix_stock)='object' and v_matrix_stock<>'{}'::jsonb then
     if v_matrix.matrix_key is null or not (v_matrix_stock ? v_matrix.matrix_key) then raise exception 'PAYMENT_P4_MATRIX_COMBINATION_REQUIRED'; end if;
     if coalesce(v_matrix_stock->>v_matrix.matrix_key,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_P4_MATRIX_STOCK_INVALID'; end if;
     v_stock:=(v_matrix_stock->>v_matrix.matrix_key)::integer;
     select coalesce(sum(l.quantity),0)::integer into v_held from private.kinto_stock_hold_lines_p4 l
       join private.kinto_stock_holds_p4 h on h.id=l.hold_id
       join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
      where l.product_id=v_matrix.product_id and l.matrix_key=v_matrix.matrix_key
       and h.status in ('active','reconciliation_required') and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
         or a.status in ('pending','succeeded','reconciliation_required'));
     if v_stock-v_held<v_matrix.requested then raise exception 'PAYMENT_P4_INSUFFICIENT_MATRIX_STOCK' using errcode='P0001'; end if;
   end if;
 end loop;
 insert into private.kinto_payment_attempts_p4(customer_id,idempotency_key,provider_key,currency,amount,status,quote_snapshot,expires_at)
   values(p_customer_id::text,p_idempotency_key,selected_provider,upper(p_currency),p_amount,'reserved',p_quote_snapshot,v_expiry) returning * into v_attempt;
 insert into private.kinto_stock_holds_p4(attempt_id,expires_at) values(v_attempt.id,v_expiry) returning * into v_hold;
 insert into private.kinto_stock_hold_lines_p4(hold_id,store_id,product_id,selected_options,matrix_key,quantity)
   select v_hold.id,(item->>'store_id')::uuid,(item->>'product_id')::uuid,coalesce(item->'selected_options','{}'::jsonb),
     public.meshwar_matrix_stock_key(coalesce(item->'selected_options','{}'::jsonb)),(item->>'quantity')::integer from jsonb_array_elements(v_lines) x(item);
 return jsonb_build_object('attempt_id',v_attempt.id,'hold_id',v_hold.id,'status','reserved','expires_at',v_expiry,'provider_key',selected_provider,'reused',false,'physical_stock_changed',false);
end;
$reserve$;

create or replace function public.customer_apply_coupon_v310(
 p_session_token text,p_order_id text,p_points bigint
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare
 cid text;o public.orders%rowtype;c text;sid text;ratio numeric;unit bigint;need integer;
 ids uuid[];cnt integer;cap bigint;vendor_points bigint:=0;kinto_points bigint:=0;fund text;
begin
 cid:=private.require_customer_review_session(p_session_token)::text;
 if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 if p_points not in(1000,3000,5000) then raise exception 'invalid coupon tier'; end if;

 select * into o from public.orders where id::text=p_order_id for update;
 if not found or o.customer_id::text<>cid then raise exception 'order not found'; end if;
 sid:=public.kinto_order_store_id_v310(o);
 if sid is null then raise exception 'store not found'; end if;
 if o.status not in('بانتظار موافقة العميل','قيد الطلب','بانتظار الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة') then
   raise exception 'coupon not allowed at this order stage';
 end if;
 if coalesce(o.reward_discount_amount,0)>0 or coalesce(o.loyalty_points_redeemed,0)>0 then
   raise exception 'order already has reward discount';
 end if;

 c:=public.kinto_normalize_currency_v310(o.currency);
 if c<>'IQD' then raise exception 'KINTO_V310_COUPON_TIERS_IQD_ONLY'; end if;
 select max_order_ratio,coupon_unit into ratio,unit from public.kinto_loyalty_settings where id=1;
 cap:=floor(coalesce(o.total_price,0)*ratio);
 if p_points>cap then raise exception 'coupon exceeds 10 percent limit'; end if;
 need:=p_points/unit;

 -- Eligibility:
 -- 1) existing non-campaign coupon: exact same store only (V310 unchanged)
 -- 2) campaign coupon: target order store must participate in that same campaign
 select array_agg(id order by expires_at,issued_at),count(*) into ids,cnt
 from(
   select q.id,q.expires_at,q.issued_at
   from public.kinto_loyalty_coupons q
   where q.customer_id=cid
     and q.currency=c
     and q.status='active'
     and not exists(select 1 from private.kinto_payment_coupon_holds_p5 p5h where p5h.coupon_id=q.id)
     and q.expires_at>now()
     and (
       (q.campaign_id is null and q.store_id=sid)
       or
       (q.campaign_id is not null and exists(
          select 1 from public.kinto_campaign_stores cs
          join public.kinto_campaigns ca on ca.id=cs.campaign_id
          where cs.campaign_id=q.campaign_id
            and cs.store_id=sid
            and ca.status<>'cancelled'
       ))
     )
   order by q.expires_at,q.issued_at
   for update of q skip locked
   limit need
 ) q;

 if coalesce(cnt,0)<>need then raise exception 'insufficient active eligible coupons'; end if;

 select
   coalesce(sum(points) filter(where funded_by='vendor'),0),
   coalesce(sum(points) filter(where funded_by='kinto'),0)
 into vendor_points,kinto_points
 from public.kinto_loyalty_coupons where id=any(ids);

 fund:=case
   when vendor_points>0 and kinto_points>0 then 'mixed'
   when kinto_points>0 then 'kinto'
   else 'vendor'
 end;

 update public.kinto_loyalty_coupons
 set status='used',used_order_id=o.id::text,used_at=now()
 where id=any(ids);

 update public.orders
 set loyalty_points_redeemed=p_points,
     reward_discount_amount=p_points,
     reward_discount_currency=c,
     reward_discount_snapshot=jsonb_build_object(
       'amount',p_points,'currency',c,'source','kinto_coupon_v401',
       'funded_by',fund,'vendor_points',vendor_points,'kinto_points',kinto_points,
       'store_id',sid,'points',p_points,'coupon_ids',to_jsonb(ids),
       'product_total',o.total_price,'shipping_discount',0
     )
 where id=o.id;

 insert into public.kinto_loyalty_ledger(
   customer_id,store_id,order_id,event_type,points,currency,
   eligible_product_total,note,funded_by,funding_snapshot
 )
 values(
   cid,sid,o.id::text,'redeem',-p_points,c,o.total_price,
   'customer_selected_eligible_coupon',fund,
   jsonb_build_object('vendor_points',vendor_points,'kinto_points',kinto_points,'coupon_ids',to_jsonb(ids))
 );

 return jsonb_build_object('ok',true,'points',p_points,'currency',c,'store_id',sid,'order_id',o.id);
end $$;

revoke all on function public.customer_apply_coupon_v310(text,text,bigint) from public;
grant execute on function public.customer_apply_coupon_v310(text,text,bigint) to anon,authenticated;

create or replace function private.kinto_payment_coupon_hold_cleanup_p5() returns trigger language plpgsql security definer set search_path=pg_catalog,private as $cleanup$ begin
 if new.status in ('failed','cancelled','expired') and old.status is distinct from new.status then
   delete from private.kinto_payment_coupon_holds_p5 where attempt_id=new.id;
 end if; return new; end;$cleanup$;
revoke all on function private.kinto_payment_coupon_hold_cleanup_p5() from public,anon,authenticated;
drop trigger if exists trg_kinto_payment_coupon_hold_cleanup_p5 on private.kinto_payment_attempts_p4;
create trigger trg_kinto_payment_coupon_hold_cleanup_p5 after update of status on private.kinto_payment_attempts_p4 for each row execute function private.kinto_payment_coupon_hold_cleanup_p5();

notify pgrst,'reload schema';
commit;
