-- G21: provider-verified confirmation through the existing V161/V47 order path.
-- Review-only migration. Apply only on an isolated KINTO database first.
-- No provider SDK, simulator, main branch, or production database is activated here.
begin;

create table if not exists private.kinto_payment_stock_permits_g21 (
  transaction_id bigint not null,
  order_id uuid not null,
  reservation_id uuid not null references public.kinto_stock_reservations_g20(id),
  primary key(transaction_id,order_id)
);
revoke all on private.kinto_payment_stock_permits_g21 from public,anon,authenticated;

create table if not exists public.kinto_payment_order_links_g21 (
  intent_id uuid not null references public.kinto_payment_intents_g18(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  store_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(intent_id,order_id),
  unique(order_id)
);
alter table public.kinto_payment_order_links_g21 enable row level security;
revoke all on public.kinto_payment_order_links_g21 from public,anon,authenticated;

create or replace function private.kinto_payment_stock_available_g21(
  p_stock integer,p_held integer,p_requested integer
) returns boolean language sql immutable set search_path=pg_catalog as $available$
  select p_requested>0 and coalesce(p_held,0)>=0
    and (p_stock is null or p_stock-coalesce(p_held,0)>=p_requested)
$available$;
revoke all on function private.kinto_payment_stock_available_g21(integer,integer,integer) from public,anon,authenticated;

-- Expired rows must leave the partial unique index before a coupon can be held again.
create or replace function private.kinto_coupon_hold_expiry_g21()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $expire_coupon$
begin
  update public.kinto_coupon_reservations_g20
     set status='expired'
   where coupon_id=new.coupon_id and status='active' and expires_at<=clock_timestamp();
  return new;
end;
$expire_coupon$;
revoke all on function private.kinto_coupon_hold_expiry_g21() from public,anon,authenticated;
drop trigger if exists trg_kinto_coupon_hold_expiry_g21 on public.kinto_coupon_reservations_g20;
create trigger trg_kinto_coupon_hold_expiry_g21
before insert on public.kinto_coupon_reservations_g20
for each row execute function private.kinto_coupon_hold_expiry_g21();

-- V401 is the installed customer_apply_coupon_v310 implementation. Filter live
-- G20 holds in its existing SKIP LOCKED selection so manual coupons in the same
-- wallet remain usable while a different coupon is temporarily held by checkout.
do $patch_v401$
declare
  v_definition text;
  v_before text:='and q.status=''active''';
  v_after text:='and q.status=''active'' and not exists ('||
    'select 1 from public.kinto_coupon_reservations_g20 cr '||
    'join public.kinto_stock_reservations_g20 r on r.id=cr.reservation_id '||
    'where cr.coupon_id=q.id and cr.status=''active'' and cr.expires_at>clock_timestamp() '||
    'and r.status=''active'' and r.expires_at>clock_timestamp())';
begin
  v_definition:=pg_get_functiondef('public.customer_apply_coupon_v310(text,text,bigint)'::regprocedure);
  if position(v_after in v_definition)>0 then
    return;
  elsif position(v_before in v_definition)=0 then
    raise exception 'G21_EXPECTED_V401_COUPON_SELECTION_NOT_FOUND';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$patch_v401$;

-- Serialize manual and electronic paid transitions against the same product row.
-- Manual V310/V401 coupon application continues to see active coupons after holds expire;
-- this guard only excludes coupons held by a live electronic reservation.
create or replace function private.kinto_payment_stock_guard_g21()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $stock_guard$
declare
  v_details jsonb;
  v_reservation_id uuid;
  v_product record;
  v_variant record;
  v_matrix record;
  v_stock integer;
  v_held integer;
  v_map jsonb;
  v_options jsonb;
  v_matrix_stock jsonb;
begin
  if new.status is distinct from 'تم التسديد' or old.status is not distinct from new.status then return new; end if;
  v_details:=coalesce(nullif(new.details,'')::jsonb,'{}'::jsonb);
  if v_details->>'source' is distinct from 'local_cart_bundle'
     or coalesce(v_details->>'bundle_stock_lifecycle_state','')='deducted' then return new; end if;
  select p.reservation_id into v_reservation_id
    from private.kinto_payment_stock_permits_g21 p
   where p.transaction_id=txid_current() and p.order_id=new.id;
  if v_reservation_id is not null and not exists(
    select 1 from public.kinto_stock_reservations_g20 r
     where r.id=v_reservation_id and r.customer_id=new.customer_id::text
       and r.status='active' and r.expires_at>clock_timestamp()
  ) then raise exception 'PAYMENT_STOCK_PERMIT_INVALID' using errcode='42501'; end if;

  -- Stable order matches G20-C and V47. A manual payment counts every live hold;
  -- an electronic payment may consume only its own hold and keeps other holds intact.
  for v_product in
    select p.id,p.stock_quantity,p.options,
      sum(greatest(1,coalesce(nullif(i->>'quantity','')::integer,1)))::integer requested
      from jsonb_array_elements(coalesce(v_details->'items','[]'::jsonb)) i
      join public.local_products p on p.id=private.v94_uuid(i->>'product_id')
     group by p.id,p.stock_quantity,p.options order by p.id
  loop
    perform 1 from public.local_products where id=v_product.id for update;
    -- Refresh the inventory snapshot only after obtaining the row lock. A prior
    -- SELECT could have waited behind V47 and otherwise retained stale stock.
    select stock_quantity,coalesce(options,'{}'::jsonb) into v_stock,v_options
      from public.local_products where id=v_product.id;
    if v_stock is not null then
      select coalesce(sum(l.quantity),0)::integer into v_held
        from public.kinto_stock_reservation_lines_g20 l
        join public.kinto_stock_reservations_g20 r on r.id=l.reservation_id
       where l.product_id=v_product.id and r.status='active' and r.expires_at>clock_timestamp()
         and (v_reservation_id is null or r.id<>v_reservation_id);
      if not private.kinto_payment_stock_available_g21(v_stock,v_held,v_product.requested) then
        raise exception 'PAYMENT_STOCK_HELD_FOR_ELECTRONIC_CHECKOUT' using errcode='P0001';
      end if;
    end if;
    for v_variant in
      select d.dimension,d.choice,sum(greatest(1,coalesce(nullif(i->>'quantity','')::integer,1)))::integer requested
        from jsonb_array_elements(coalesce(v_details->'items','[]'::jsonb)) i
        cross join lateral (values
          ('color'::text,nullif(btrim(i->'selected_options'->>'color'),'')),
          ('size'::text,nullif(btrim(i->'selected_options'->>'size'),'')),
          ('volume'::text,nullif(btrim(i->'selected_options'->>'volume'),''))
        ) d(dimension,choice)
       where private.v94_uuid(i->>'product_id')=v_product.id and d.choice is not null
       group by d.dimension,d.choice order by d.dimension,d.choice
    loop
      v_map:=coalesce(v_options->'variant_stock'->v_variant.dimension,
        v_options->'variant_stock'->(v_variant.dimension||'s'));
      if jsonb_typeof(v_map)='object' and v_map ? v_variant.choice then
        if coalesce(v_map->>v_variant.choice,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_VARIANT_STOCK_INVALID'; end if;
        v_stock:=(v_map->>v_variant.choice)::integer;
        select coalesce(sum(l.quantity),0)::integer into v_held
          from public.kinto_stock_reservation_lines_g20 l
          join public.kinto_stock_reservations_g20 r on r.id=l.reservation_id
         where l.product_id=v_product.id and r.status='active' and r.expires_at>clock_timestamp()
           and coalesce(l.selected_options->>v_variant.dimension,'')=v_variant.choice
           and (v_reservation_id is null or r.id<>v_reservation_id);
        if not private.kinto_payment_stock_available_g21(v_stock,v_held,v_variant.requested) then
          raise exception 'PAYMENT_VARIANT_HELD_FOR_ELECTRONIC_CHECKOUT' using errcode='P0001';
        end if;
      end if;
    end loop;
    v_matrix_stock:=coalesce(v_options->'matrix_stock','{}'::jsonb);
    if jsonb_typeof(v_matrix_stock)='object' and v_matrix_stock<>'{}'::jsonb then
      for v_matrix in
        select public.meshwar_matrix_stock_key(coalesce(i->'selected_options','{}'::jsonb)) matrix_key,
          sum(greatest(1,coalesce(nullif(i->>'quantity','')::integer,1)))::integer requested
          from jsonb_array_elements(coalesce(v_details->'items','[]'::jsonb)) i
         where private.v94_uuid(i->>'product_id')=v_product.id
         group by public.meshwar_matrix_stock_key(coalesce(i->'selected_options','{}'::jsonb))
      loop
        if v_matrix.matrix_key is null or not (v_matrix_stock ? v_matrix.matrix_key)
           or coalesce(v_matrix_stock->>v_matrix.matrix_key,'') !~ '^[0-9]+$' then
          raise exception 'PAYMENT_MATRIX_STOCK_CONFIGURATION_INVALID';
        end if;
        v_stock:=(v_matrix_stock->>v_matrix.matrix_key)::integer;
        select coalesce(sum(l.quantity),0)::integer into v_held
          from public.kinto_stock_reservation_lines_g20 l
          join public.kinto_stock_reservations_g20 r on r.id=l.reservation_id
         where l.product_id=v_product.id and l.matrix_key=v_matrix.matrix_key
           and r.status='active' and r.expires_at>clock_timestamp()
           and (v_reservation_id is null or r.id<>v_reservation_id);
        if not private.kinto_payment_stock_available_g21(v_stock,v_held,v_matrix.requested) then
          raise exception 'PAYMENT_MATRIX_HELD_FOR_ELECTRONIC_CHECKOUT' using errcode='P0001';
        end if;
      end loop;
    end if;
  end loop;
  return new;
end;
$stock_guard$;
revoke all on function private.kinto_payment_stock_guard_g21() from public,anon,authenticated;
drop trigger if exists trg_kinto_payment_stock_guard_g21 on public.orders;
create trigger trg_kinto_payment_stock_guard_g21
before update of status on public.orders
for each row when (old.status is distinct from new.status and new.status='تم التسديد')
execute function private.kinto_payment_stock_guard_g21();

create or replace function private.kinto_payment_consume_coupon_g21(
  p_reservation_id uuid,p_order_id uuid,p_store_id uuid,p_coupon_amount bigint
) returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $consume_coupon$
declare
  v_order public.orders%rowtype;
  v_reservation public.kinto_stock_reservations_g20%rowtype;
  v_coupon_ratio numeric;
  v_coupon_unit bigint;
  v_expected_ids uuid[];
  v_actual_ids uuid[];
  v_vendor_points bigint;
  v_kinto_points bigint;
  v_fund text;
begin
  if coalesce(p_coupon_amount,0)=0 then return; end if;
  select * into v_reservation from public.kinto_stock_reservations_g20
   where id=p_reservation_id and status='active' for update;
  if not found then raise exception 'PAYMENT_COUPON_RESERVATION_NOT_ACTIVE'; end if;
  select * into v_order from public.orders where id=p_order_id and status<>'تم التسديد' for update;
  if not found or v_order.customer_id::text<>v_reservation.customer_id then raise exception 'PAYMENT_COUPON_ORDER_INVALID'; end if;
  if upper(coalesce(v_order.currency,''))<>'IQD' then raise exception 'PAYMENT_COUPON_CURRENCY_INVALID'; end if;
  select max_order_ratio,coupon_unit into v_coupon_ratio,v_coupon_unit from public.kinto_loyalty_settings where id=1;
  if v_coupon_unit is null or v_coupon_unit<=0 or p_coupon_amount<=0
     or p_coupon_amount%v_coupon_unit<>0 or p_coupon_amount>floor(coalesce(v_order.total_price,0)*v_coupon_ratio) then
    raise exception 'PAYMENT_COUPON_LIMIT_INVALID';
  end if;
  select array_agg(value::uuid order by value::uuid) into v_expected_ids
    from jsonb_array_elements_text(coalesce((select q.quote_snapshot->'coupon_ids'->p_store_id::text
      from public.kinto_payment_quotes_g20 q where q.id=v_reservation.quote_id),'[]'::jsonb));
  select array_agg(cr.coupon_id order by cr.coupon_id) into v_actual_ids
    from public.kinto_coupon_reservations_g20 cr
   where cr.reservation_id=p_reservation_id and cr.status='active' and cr.expires_at>clock_timestamp();
  if coalesce(v_actual_ids,'{}'::uuid[]) is distinct from coalesce(v_expected_ids,'{}'::uuid[])
     or coalesce(cardinality(v_actual_ids),0)<>(p_coupon_amount/v_coupon_unit)::integer then
    raise exception 'PAYMENT_COUPON_RESERVATION_INVALID';
  end if;
  perform 1 from public.kinto_loyalty_coupons c where c.id=any(v_actual_ids)
    and c.customer_id=v_reservation.customer_id and c.currency='IQD' and c.status='active' and c.expires_at>clock_timestamp()
    and ((c.campaign_id is null and c.store_id::text=p_store_id::text)
      or (c.campaign_id is not null and exists(
        select 1 from public.kinto_campaign_stores cs join public.kinto_campaigns ca on ca.id=cs.campaign_id
        where cs.campaign_id=c.campaign_id and cs.store_id=p_store_id and ca.status<>'cancelled')))
   order by c.id for update;
  if (select count(*) from public.kinto_loyalty_coupons c where c.id=any(v_actual_ids)
      and c.customer_id=v_reservation.customer_id and c.currency='IQD' and c.status='active' and c.expires_at>clock_timestamp()
      and ((c.campaign_id is null and c.store_id=p_store_id) or (c.campaign_id is not null and exists(
        select 1 from public.kinto_campaign_stores cs join public.kinto_campaigns ca on ca.id=cs.campaign_id
        where cs.campaign_id=c.campaign_id and cs.store_id=p_store_id and ca.status<>'cancelled'))))<>cardinality(v_actual_ids) then
    raise exception 'PAYMENT_COUPON_NO_LONGER_AVAILABLE';
  end if;
  select coalesce(sum(points) filter(where funded_by='vendor'),0),coalesce(sum(points) filter(where funded_by='kinto'),0)
    into v_vendor_points,v_kinto_points from public.kinto_loyalty_coupons where id=any(v_actual_ids);
  v_fund:=case when v_vendor_points>0 and v_kinto_points>0 then 'mixed' when v_kinto_points>0 then 'kinto' else 'vendor' end;
  perform set_config('app.kinto_payment_reservation_id',p_reservation_id::text,true);
  update public.kinto_loyalty_coupons set status='used',used_order_id=p_order_id::text,used_at=clock_timestamp()
   where id=any(v_actual_ids);
  update public.orders set loyalty_points_redeemed=p_coupon_amount,reward_discount_amount=p_coupon_amount,
    reward_discount_currency='IQD',reward_discount_snapshot=jsonb_build_object('amount',p_coupon_amount,
    'currency','IQD','source','kinto_payment_coupon_g21','funded_by',v_fund,'vendor_points',v_vendor_points,
    'kinto_points',v_kinto_points,'store_id',p_store_id,'points',p_coupon_amount,'coupon_ids',to_jsonb(v_actual_ids),
    'product_total',v_order.total_price,'shipping_discount',0) where id=p_order_id;
  insert into public.kinto_loyalty_ledger(customer_id,store_id,order_id,event_type,points,currency,
    eligible_product_total,note,funded_by,funding_snapshot)
  values(v_reservation.customer_id,p_store_id,p_order_id::text,'redeem',-p_coupon_amount,'IQD',v_order.total_price,
    'customer_selected_reserved_payment_coupon_g21',v_fund,jsonb_build_object('vendor_points',v_vendor_points,
    'kinto_points',v_kinto_points,'coupon_ids',to_jsonb(v_actual_ids)));
  update public.kinto_coupon_reservations_g20 set status='consumed'
   where reservation_id=p_reservation_id and coupon_id=any(v_actual_ids) and status='active';
end;
$consume_coupon$;
revoke all on function private.kinto_payment_consume_coupon_g21(uuid,uuid,uuid,bigint) from public,anon,authenticated;

create or replace function public.kinto_payment_record_verified_event_g21(
  p_intent_id uuid,p_provider_key text,p_provider_event_id text,p_event_type text,
  p_event_fingerprint text,p_signature_verified boolean,p_provider_reference text,
  p_amount_minor bigint,p_currency text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $record_event$
declare
  v_intent public.kinto_payment_intents_g18%rowtype;
  v_event public.kinto_payment_gateway_events_g18%rowtype;
  v_reservation public.kinto_stock_reservations_g20%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
  if p_intent_id is null or p_event_type not in ('captured','failed')
     or nullif(btrim(p_provider_event_id),'') is null or length(p_provider_event_id)>200
     or p_event_fingerprint !~ '^[0-9a-f]{64}$' or p_signature_verified is not true
     or nullif(btrim(p_provider_reference),'') is null or p_amount_minor<=0 or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'PAYMENT_VERIFIED_EVENT_INVALID' using errcode='22023';
  end if;
  select * into v_intent from public.kinto_payment_intents_g18 where id=p_intent_id for update;
  if not found then raise exception 'PAYMENT_INTENT_NOT_FOUND'; end if;
  if v_intent.provider_key is distinct from p_provider_key
     or (v_intent.provider_reference is not null and v_intent.provider_reference is distinct from p_provider_reference)
     or v_intent.amount_minor is distinct from p_amount_minor or v_intent.currency is distinct from p_currency then
    raise exception 'PAYMENT_EVENT_IDENTITY_MISMATCH' using errcode='22023';
  end if;
  if v_intent.provider_key='test-simulator' then
    raise exception 'SIMULATOR_CANNOT_RECORD_PRODUCTION_PAYMENT' using errcode='42501';
  end if;
  insert into public.kinto_payment_gateway_events_g18(provider_key,provider_event_id,intent_id,event_type,
    event_fingerprint,signature_verified,amount_minor,currency,processing_status)
  values(p_provider_key,p_provider_event_id,p_intent_id,p_event_type,p_event_fingerprint,true,p_amount_minor,p_currency,'received')
  on conflict(provider_key,provider_event_id) do nothing returning * into v_event;
  if not found then
    select * into v_event from public.kinto_payment_gateway_events_g18
     where provider_key=p_provider_key and provider_event_id=p_provider_event_id;
    if v_event.event_fingerprint is distinct from p_event_fingerprint or v_event.intent_id is distinct from p_intent_id then
      raise exception 'PAYMENT_EVENT_ID_REUSED' using errcode='23505';
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'event_id',v_event.id,'processing_status',v_event.processing_status);
  end if;
  if v_intent.provider_reference is null then
    update public.kinto_payment_intents_g18 set provider_reference=p_provider_reference,updated_at=clock_timestamp() where id=p_intent_id;
  end if;
  if p_event_type='failed' then
    if v_intent.status in ('captured','partially_refunded','refunded') then
      update public.kinto_payment_gateway_events_g18 set processing_status='rejected',processed_at=clock_timestamp() where id=v_event.id;
      return jsonb_build_object('ok',false,'event_id',v_event.id,'status','rejected','reason','PAYMENT_FAILURE_AFTER_CAPTURE');
    end if;
    update public.kinto_payment_intents_g18 set status='failed',updated_at=clock_timestamp() where id=p_intent_id;
    select * into v_reservation from public.kinto_stock_reservations_g20 where quote_id=v_intent.quote_id for update;
    if found and v_reservation.status='active' then
      update public.kinto_stock_reservations_g20 set status='released',released_at=clock_timestamp(),release_reason='verified_payment_failure' where id=v_reservation.id;
      update public.kinto_coupon_reservations_g20 set status='released' where reservation_id=v_reservation.id and status='active';
      update public.kinto_payment_quotes_g20 set status='cancelled' where id=v_reservation.quote_id and status='reserved';
    end if;
    update public.kinto_payment_gateway_events_g18 set processing_status='processed',processed_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'event_id',v_event.id,'status','failed','orders_created',false);
  end if;
  if v_intent.status in ('failed','cancelled','refunded','partially_refunded','reconciliation_required') then
    update public.kinto_payment_intents_g18 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_intent_id;
    update public.kinto_payment_gateway_events_g18 set processing_status='reconciliation_required',processed_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'event_id',v_event.id,'status','reconciliation_required','orders_created',false);
  end if;
  update public.kinto_payment_intents_g18 set status='captured',updated_at=clock_timestamp() where id=p_intent_id;
  return jsonb_build_object('ok',true,'event_id',v_event.id,'status','captured','finalization_required',true);
end;
$record_event$;
revoke all on function public.kinto_payment_record_verified_event_g21(uuid,text,text,text,text,boolean,text,bigint,text) from public,anon,authenticated;
grant execute on function public.kinto_payment_record_verified_event_g21(uuid,text,text,text,text,boolean,text,bigint,text) to service_role;

create unique index if not exists kinto_payment_intents_g21_one_intent_per_quote_idx
  on public.kinto_payment_intents_g18(quote_id);

create or replace function public.kinto_payment_admit_reserved_intent_g21(
  p_customer_id text,p_quote_id uuid,p_reservation_id uuid,p_idempotency_key text,
  p_provider_snapshot jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $admit_reserved$
declare
  v_quote public.kinto_payment_quotes_g20%rowtype;
  v_reservation public.kinto_stock_reservations_g20%rowtype;
  v_settings public.kinto_payment_settings_g16%rowtype;
  v_provider public.kinto_payment_gateway_providers_g18%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
  if nullif(btrim(p_customer_id),'') is null or p_quote_id is null or p_reservation_id is null
     or length(coalesce(p_idempotency_key,'')) not between 12 and 160
     or jsonb_typeof(coalesce(p_provider_snapshot,'{}'::jsonb)) is distinct from 'object' then
    raise exception 'PAYMENT_ADMISSION_INVALID' using errcode='22023';
  end if;
  select * into v_quote from public.kinto_payment_quotes_g20 where id=p_quote_id for update;
  select * into v_reservation from public.kinto_stock_reservations_g20
   where id=p_reservation_id and quote_id=p_quote_id for update;
  if not found or v_quote.id is null or v_quote.customer_id<>p_customer_id
     or v_reservation.customer_id<>p_customer_id or v_reservation.status<>'active'
     or v_reservation.expires_at<=clock_timestamp() or v_quote.status<>'reserved'
     or v_quote.currency is null or v_quote.amount is null or v_quote.amount<=0
     or v_quote.amount<>trunc(v_quote.amount)
     or coalesce((v_quote.quote_snapshot->>'electronic_eligible')::boolean,false) is not true then
    raise exception 'PAYMENT_RESERVATION_NOT_ADMISSIBLE' using errcode='55000';
  end if;
  select * into v_settings from public.kinto_payment_settings_g16 where singleton=true;
  select * into v_provider from public.kinto_payment_gateway_providers_g18
    where provider_key=v_settings.active_gateway_provider;
  if v_provider.provider_key is null or v_provider.provider_key='test-simulator' then
    update public.kinto_stock_reservations_g20 set status='released',released_at=clock_timestamp(),
      release_reason='electronic_provider_not_configured'
     where id=p_reservation_id and status='active';
    update public.kinto_coupon_reservations_g20 set status='released'
     where reservation_id=p_reservation_id and status='active';
    update public.kinto_payment_quotes_g20 set status='cancelled'
     where id=p_quote_id and status='reserved';
    return jsonb_build_object('ok',false,'manual_available',true,'reason','PAYMENT_PROVIDER_NOT_CONFIGURED');
  end if;
  -- G18 takes the settings row lock and remains the final emergency-stop gate.
  -- If a pause wins that race, release this hold so manual checkout is immediately usable.
  begin
    v_result:=public.kinto_payment_admit_intent_g18(p_customer_id,p_quote_id,v_provider.provider_key,
      v_quote.amount::bigint,v_quote.currency,p_idempotency_key,v_reservation.expires_at,
      coalesce(p_provider_snapshot,'{}'::jsonb));
  exception when sqlstate '55000' then
    update public.kinto_stock_reservations_g20 set status='released',released_at=clock_timestamp(),
      release_reason='electronic_payment_paused_or_provider_unavailable'
     where id=p_reservation_id and status='active';
    update public.kinto_coupon_reservations_g20 set status='released'
     where reservation_id=p_reservation_id and status='active';
    update public.kinto_payment_quotes_g20 set status='cancelled'
     where id=p_quote_id and status='reserved';
    return jsonb_build_object('ok',false,'manual_available',true,'reason','NEW_PAYMENTS_PAUSED');
  end;
  update public.kinto_payment_quotes_g20 set expires_at=v_reservation.expires_at
   where id=p_quote_id and status='reserved';
  return v_result||jsonb_build_object('reservation_id',v_reservation.id,'reservation_expires_at',v_reservation.expires_at);
end;
$admit_reserved$;
revoke all on function public.kinto_payment_admit_reserved_intent_g21(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_admit_reserved_intent_g21(text,uuid,uuid,text,jsonb) to service_role;

create or replace function public.kinto_payment_finalize_g21(p_event_id bigint)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions,pg_temp as $finalize$
declare
  v_event public.kinto_payment_gateway_events_g18%rowtype;
  v_intent public.kinto_payment_intents_g18%rowtype;
  v_reservation public.kinto_stock_reservations_g20%rowtype;
  v_quote public.kinto_payment_quotes_g20%rowtype;
  v_customer_id uuid;
  v_customer public.customers%rowtype;
  v_lines jsonb;
  v_coupon_selection jsonb;
  v_orders jsonb;
  v_order jsonb;
  v_store jsonb;
  v_price record;
  v_product_id uuid;
  v_error text;
  v_order_ids jsonb:='[]'::jsonb;
  v_tx bigint:=txid_current();
  v_now timestamptz:=clock_timestamp();
  v_coupon_amount bigint;
  v_intent_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
  select intent_id into v_intent_id from public.kinto_payment_gateway_events_g18 where id=p_event_id;
  if not found then raise exception 'PAYMENT_EVENT_NOT_FOUND'; end if;
  select * into v_intent from public.kinto_payment_intents_g18 where id=v_intent_id for update;
  if not found then raise exception 'PAYMENT_INTENT_NOT_FOUND'; end if;
  select * into v_event from public.kinto_payment_gateway_events_g18 where id=p_event_id for update;
  if v_event.processing_status='processed' then
    select coalesce(jsonb_agg(jsonb_build_object('order_id',l.order_id,'store_id',l.store_id) order by l.store_id),'[]'::jsonb)
      into v_order_ids from public.kinto_payment_order_links_g21 l where l.intent_id=v_intent.id;
    return jsonb_build_object('ok',true,'duplicate',true,'status','processed','orders',v_order_ids);
  end if;
  if v_event.signature_verified is not true or v_event.event_type<>'captured'
     or v_intent.provider_key='test-simulator'
     or v_event.provider_key is distinct from v_intent.provider_key
     or v_event.amount_minor is distinct from v_intent.amount_minor
     or v_event.currency is distinct from v_intent.currency
     or v_intent.status<>'captured' then raise exception 'PAYMENT_CAPTURE_NOT_VERIFIED'; end if;
  select * into v_reservation from public.kinto_stock_reservations_g20
   where quote_id=v_intent.quote_id for update;
  select * into v_quote from public.kinto_payment_quotes_g20 where id=v_intent.quote_id for update;
  if not found or v_reservation.id is null or v_reservation.customer_id<>v_intent.customer_id
     or v_quote.customer_id<>v_intent.customer_id or v_quote.currency<>v_intent.currency
     or v_quote.amount<>v_intent.amount_minor then
    update public.kinto_payment_intents_g18 set status='reconciliation_required',updated_at=v_now where id=v_intent.id;
    update public.kinto_payment_gateway_events_g18 set processing_status='reconciliation_required',processed_at=v_now where id=p_event_id;
    return jsonb_build_object('ok',false,'status','reconciliation_required','reason','QUOTE_OR_RESERVATION_MISMATCH','orders_created',false);
  end if;
  if v_reservation.status<>'active' or v_reservation.expires_at<=v_now
     or v_quote.status<>'reserved' then
    update public.kinto_stock_reservations_g20 set status='requires_reconciliation',released_at=v_now,release_reason='capture_after_reservation_expiry' where id=v_reservation.id;
    update public.kinto_coupon_reservations_g20 set status='expired' where reservation_id=v_reservation.id and status='active';
    update public.kinto_payment_quotes_g20 set status='expired' where id=v_quote.id and status='reserved';
    update public.kinto_payment_intents_g18 set status='reconciliation_required',updated_at=v_now where id=v_intent.id;
    update public.kinto_payment_gateway_events_g18 set processing_status='reconciliation_required',processed_at=v_now where id=p_event_id;
    insert into public.kinto_payment_financial_events_g18(intent_id,event_kind,provider_key,provider_reference,
      provider_event_id,amount_minor,currency,idempotency_key,metadata)
    values(v_intent.id,'reconciliation',v_intent.provider_key,v_intent.provider_reference,v_event.provider_event_id,
      v_intent.amount_minor,v_intent.currency,'late-capture:'||v_intent.id::text,jsonb_build_object('reason','reservation_expired'))
    on conflict(idempotency_key) do nothing;
    return jsonb_build_object('ok',false,'status','reconciliation_required','reason','RESERVATION_EXPIRED','orders_created',false);
  end if;
  v_customer_id:=private.v94_uuid(v_intent.customer_id);
  if v_customer_id is null then raise exception 'PAYMENT_CUSTOMER_ID_INVALID'; end if;
  select * into v_customer from public.customers where id=v_customer_id;
  if not found then raise exception 'PAYMENT_CUSTOMER_NOT_FOUND'; end if;
  v_lines:=v_quote.quote_snapshot->'lines';
  v_coupon_selection:=coalesce(v_quote.quote_snapshot->'coupon_selection','{}'::jsonb);

  -- Same row lock order as the reserve and V47 paths serializes manual payment races.
  for v_product_id in select distinct (item->>'product_id')::uuid
    from jsonb_array_elements(v_lines) q(item) order by (item->>'product_id')::uuid
  loop
    perform 1 from public.local_products p where p.id=v_product_id for update;
    if not found then v_error:='PRODUCT_MISSING'; exit; end if;
  end loop;
  if v_error is null then
    for v_price in
      select item->>'product_id' product_id,item->>'store_id' store_id,
        (item->>'unit_price_minor')::numeric quoted_unit,
        (item->'pricing_snapshot'->>'vendor_price_usd')::numeric quoted_vendor,
        (item->'pricing_snapshot'->>'commission_rate')::numeric quoted_commission,
        (item->'pricing_snapshot'->>'exchange_rate')::numeric quoted_exchange,
        upper(item->>'currency') quoted_currency,
        ceil((ceil(coalesce(p.discount_price,p.base_price)::numeric/(1-coalesce(s.commission_rate,10)::numeric/100))*s.exchange_rate::numeric)/1000)*1000 current_unit,
        coalesce(p.discount_price,p.base_price)::numeric current_vendor,
        coalesce(s.commission_rate,10)::numeric current_commission,s.exchange_rate::numeric current_exchange,
        upper(coalesce(nullif(s.exchange_target_currency,''),nullif(s.default_currency,''),'IQD')) current_currency
      from jsonb_array_elements(v_lines) q(item)
      join public.local_products p on p.id=(item->>'product_id')::uuid and p.store_id=(item->>'store_id')::uuid
      join public.local_stores s on s.id=p.store_id
    loop
      if v_price.quoted_unit is distinct from v_price.current_unit
         or v_price.quoted_vendor is distinct from v_price.current_vendor
         or v_price.quoted_commission is distinct from v_price.current_commission
         or v_price.quoted_exchange is distinct from v_price.current_exchange
         or v_price.quoted_currency is distinct from v_price.current_currency then
        v_error:='QUOTE_PRICE_CHANGED'; exit;
      end if;
    end loop;
  end if;
  if v_error is not null then
    update public.kinto_stock_reservations_g20 set status='requires_reconciliation',released_at=v_now,release_reason=v_error where id=v_reservation.id;
    update public.kinto_coupon_reservations_g20 set status='expired' where reservation_id=v_reservation.id and status='active';
    update public.kinto_payment_quotes_g20 set status='expired' where id=v_quote.id and status='reserved';
    update public.kinto_payment_intents_g18 set status='reconciliation_required',updated_at=v_now where id=v_intent.id;
    update public.kinto_payment_gateway_events_g18 set processing_status='reconciliation_required',processed_at=v_now where id=p_event_id;
    return jsonb_build_object('ok',false,'status','reconciliation_required','reason',v_error,'orders_created',false);
  end if;

  -- All order insertion, coupons, V47 deduction, and paid status updates share one
  -- subtransaction. Any conflict rolls it all back and leaves the charge for reconciliation.
  begin
    v_orders:=public.checkout_independent_vendor_orders_v161(v_customer_id,v_customer.name,v_customer.phone,'{}'::jsonb,
      (select jsonb_agg(jsonb_build_object('store_id',item->>'store_id','product_id',item->>'product_id',
        'selected_options',coalesce(item->'selected_options','{}'::jsonb),'quantity',(item->>'quantity')::integer) order by ord)
       from jsonb_array_elements(v_lines) with ordinality q(item,ord)));
    if jsonb_typeof(v_orders->'orders') is distinct from 'array'
       or jsonb_array_length(v_orders->'orders')<>(select jsonb_array_length(v_quote.quote_snapshot->'stores')) then
      raise exception 'PAYMENT_CANONICAL_ORDER_COUNT_MISMATCH';
    end if;
    for v_store in select value from jsonb_array_elements(v_quote.quote_snapshot->'stores') loop
      if not exists(select 1 from jsonb_array_elements(v_orders->'orders') o
        where o->>'store_id'=v_store->>'store_id' and o->>'currency'=v_store->>'currency'
          and (o->>'total_price')::numeric=(v_store->>'subtotal_minor')::numeric) then
        raise exception 'PAYMENT_CANONICAL_ORDER_AMOUNT_MISMATCH';
      end if;
      v_coupon_amount:=coalesce((v_coupon_selection->>(v_store->>'store_id'))::bigint,0);
      if v_coupon_amount>0 then
        select (o->>'id')::uuid into v_product_id from jsonb_array_elements(v_orders->'orders') o
         where o->>'store_id'=v_store->>'store_id';
        perform private.kinto_payment_consume_coupon_g21(v_reservation.id,v_product_id,(v_store->>'store_id')::uuid,v_coupon_amount);
      end if;
    end loop;
    if (select sum((s->>'subtotal_minor')::numeric-coalesce((v_coupon_selection->>(s->>'store_id'))::numeric,0))
          from jsonb_array_elements(v_quote.quote_snapshot->'stores') s)<>v_intent.amount_minor then
      raise exception 'PAYMENT_CAPTURE_TOTAL_MISMATCH';
    end if;
    for v_order in select value from jsonb_array_elements(v_orders->'orders') loop
      v_product_id:=(v_order->>'id')::uuid;
      insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(v_tx,v_product_id);
      insert into private.kinto_payment_stock_permits_g21(transaction_id,order_id,reservation_id)
        values(v_tx,v_product_id,v_reservation.id);
      update public.orders o set status='تم التسديد',details=(coalesce(nullif(o.details,'')::jsonb,'{}'::jsonb)
        ||jsonb_build_object('kinto_payment',jsonb_build_object('intent_id',v_intent.id,
          'payment_reference',v_intent.payment_reference,'provider_key',v_intent.provider_key,
          'provider_environment',v_intent.provider_environment,'provider_adapter_version',v_intent.provider_adapter_version,
          'provider_reference',v_intent.provider_reference,'currency',v_intent.currency,
          'amount_minor',v_intent.amount_minor,'confirmed_at',v_now)))::text
       where o.id=v_product_id and o.status<>'تم التسديد';
      if not found then raise exception 'PAYMENT_ORDER_ALREADY_FINALIZED'; end if;
      insert into public.kinto_payment_order_links_g21(intent_id,order_id,store_id)
        values(v_intent.id,v_product_id,(v_order->>'store_id')::uuid);
      v_order_ids:=v_order_ids||jsonb_build_array(jsonb_build_object('order_id',v_product_id,'store_id',v_order->>'store_id'));
    end loop;
    delete from private.kinto_paid_transition_permits_v1 where transaction_id=v_tx;
    delete from private.kinto_payment_stock_permits_g21 where transaction_id=v_tx;
    update public.kinto_stock_reservations_g20 set status='consumed',released_at=v_now,release_reason='verified_capture_finalized' where id=v_reservation.id;
    update public.kinto_coupon_reservations_g20 set status='consumed' where reservation_id=v_reservation.id and status='active';
    update public.kinto_payment_quotes_g20 set status='consumed' where id=v_quote.id and status='reserved';
  exception when others then
    get stacked diagnostics v_error=message_text;
    v_order_ids:='[]'::jsonb;
  end;
  if v_error is not null then
    update public.kinto_stock_reservations_g20 set status='requires_reconciliation',released_at=v_now,release_reason=left(v_error,200) where id=v_reservation.id and status='active';
    update public.kinto_coupon_reservations_g20 set status='expired' where reservation_id=v_reservation.id and status='active';
    update public.kinto_payment_quotes_g20 set status='expired' where id=v_quote.id and status='reserved';
    update public.kinto_payment_intents_g18 set status='reconciliation_required',updated_at=v_now where id=v_intent.id;
    update public.kinto_payment_gateway_events_g18 set processing_status='reconciliation_required',processed_at=v_now where id=p_event_id;
    insert into public.kinto_payment_financial_events_g18(intent_id,event_kind,provider_key,provider_reference,
      provider_event_id,amount_minor,currency,idempotency_key,metadata)
    values(v_intent.id,'reconciliation',v_intent.provider_key,v_intent.provider_reference,v_event.provider_event_id,
      v_intent.amount_minor,v_intent.currency,'finalize-failed:'||v_intent.id::text,jsonb_build_object('reason',left(v_error,200)))
    on conflict(idempotency_key) do nothing;
    return jsonb_build_object('ok',false,'status','reconciliation_required','reason',left(v_error,200),'orders_created',false);
  end if;
  update public.kinto_payment_gateway_events_g18 set processing_status='processed',processed_at=v_now where id=p_event_id;
  insert into public.kinto_payment_financial_events_g18(intent_id,event_kind,provider_key,provider_reference,
    provider_event_id,amount_minor,currency,idempotency_key,metadata)
  values(v_intent.id,'capture',v_intent.provider_key,v_intent.provider_reference,v_event.provider_event_id,
    v_intent.amount_minor,v_intent.currency,'capture:'||v_intent.id::text,jsonb_build_object('orders',v_order_ids))
  on conflict(idempotency_key) do nothing;
  return jsonb_build_object('ok',true,'status','processed','orders_created',true,'orders',v_order_ids,
    'checkout_group_id',v_orders->>'checkout_group_id');
end;
$finalize$;
revoke all on function public.kinto_payment_finalize_g21(bigint) from public,anon,authenticated;
grant execute on function public.kinto_payment_finalize_g21(bigint) to service_role;

comment on function public.kinto_payment_finalize_g21(bigint) is
'G21 trusted capture finalizer. Service-role only; consumes only live G20 holds, creates via V161, and uses the existing guarded paid transition/V47 exactly once. Captures with expired holds or canonical stock/pricing conflicts go to reconciliation without creating orders.';

notify pgrst,'reload schema';
commit;
