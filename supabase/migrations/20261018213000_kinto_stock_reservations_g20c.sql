-- G20-C: temporary stock/coupon holds for electronic checkout quotes.
-- This is independent of V47: it never updates local_products or orders.
-- A future verified payment finalizer must consume a live hold and then invoke
-- the existing paid-order path exactly once. This migration does not do that.
begin;

create table if not exists public.kinto_stock_reservations_g20 (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.kinto_payment_quotes_g20(id) on delete restrict,
  customer_id text not null,
  idempotency_key text not null,
  status text not null default 'active'
    check (status in ('active','released','expired','consumed','requires_reconciliation')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  unique(customer_id,idempotency_key),
  check (expires_at > created_at)
);
create index if not exists kinto_stock_reservations_g20_active_expiry_idx
  on public.kinto_stock_reservations_g20(expires_at) where status='active';

create table if not exists public.kinto_stock_reservation_lines_g20 (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.kinto_stock_reservations_g20(id) on delete restrict,
  product_id uuid not null references public.local_products(id) on delete restrict,
  selected_options jsonb not null default '{}'::jsonb check (jsonb_typeof(selected_options)='object'),
  matrix_key text,
  quantity integer not null check (quantity between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists kinto_stock_reservation_lines_g20_product_idx
  on public.kinto_stock_reservation_lines_g20(product_id,reservation_id);
create index if not exists kinto_stock_reservation_lines_g20_matrix_idx
  on public.kinto_stock_reservation_lines_g20(product_id,matrix_key) where matrix_key is not null;

create table if not exists public.kinto_coupon_reservations_g20 (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.kinto_stock_reservations_g20(id) on delete restrict,
  coupon_id uuid not null references public.kinto_loyalty_coupons(id) on delete restrict,
  status text not null default 'active' check (status in ('active','released','expired','consumed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(reservation_id,coupon_id)
);
create unique index if not exists kinto_coupon_reservations_g20_one_active_idx
  on public.kinto_coupon_reservations_g20(coupon_id) where status='active';
create index if not exists kinto_coupon_reservations_g20_expiry_idx
  on public.kinto_coupon_reservations_g20(expires_at) where status='active';

alter table public.kinto_stock_reservations_g20 enable row level security;
alter table public.kinto_stock_reservation_lines_g20 enable row level security;
alter table public.kinto_coupon_reservations_g20 enable row level security;
revoke all on public.kinto_stock_reservations_g20 from public,anon,authenticated;
revoke all on public.kinto_stock_reservation_lines_g20 from public,anon,authenticated;
revoke all on public.kinto_coupon_reservations_g20 from public,anon,authenticated;

create or replace function private.kinto_stock_available_g20c(
  p_physical_stock integer,
  p_active_reserved integer,
  p_requested integer
) returns boolean
language sql immutable
set search_path=pg_catalog
as $available$
  select coalesce(p_requested,0)>0
     and coalesce(p_active_reserved,0)>=0
     and (p_physical_stock is null or p_physical_stock-coalesce(p_active_reserved,0)>=p_requested)
$available$;
revoke all on function private.kinto_stock_available_g20c(integer,integer,integer) from public,anon,authenticated;

-- Keep the existing V310 coupon consumer from spending an ID already held by
-- an active electronic quote. The future finalizer must set this transaction
-- local GUC only after verifying and locking the same reservation.
create or replace function private.kinto_coupon_reservation_guard_g20()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $coupon_guard$
declare
  v_reservation_id uuid;
  v_context_reservation text;
begin
  if new.status<>'used' or old.status='used' then return new; end if;
  select r.id into v_reservation_id
    from public.kinto_coupon_reservations_g20 cr
    join public.kinto_stock_reservations_g20 r on r.id=cr.reservation_id
   where cr.coupon_id=old.id and cr.status='active' and cr.expires_at>clock_timestamp()
     and r.status='active' and r.expires_at>clock_timestamp()
   limit 1;
  if v_reservation_id is null then return new; end if;
  v_context_reservation:=current_setting('app.kinto_payment_reservation_id',true);
  if v_context_reservation is distinct from v_reservation_id::text then
    raise exception 'LOYALTY_COUPON_RESERVED_FOR_PAYMENT' using errcode='55000';
  end if;
  return new;
end;
$coupon_guard$;
revoke all on function private.kinto_coupon_reservation_guard_g20() from public,anon,authenticated;
drop trigger if exists trg_kinto_coupon_reservation_guard_g20 on public.kinto_loyalty_coupons;
create trigger trg_kinto_coupon_reservation_guard_g20
before update of status on public.kinto_loyalty_coupons
for each row when (new.status='used' and old.status is distinct from new.status)
execute function private.kinto_coupon_reservation_guard_g20();

create or replace function public.kinto_stock_reserve_g20(
  p_session_token text,
  p_quote_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,extensions,pg_temp
as $reserve$
declare
  v_customer text;
  v_quote public.kinto_payment_quotes_g20%rowtype;
  v_reservation public.kinto_stock_reservations_g20%rowtype;
  v_product_id uuid;
  v_product record;
  v_line record;
  v_variant record;
  v_matrix record;
  v_price record;
  v_held integer;
  v_stock integer;
  v_variant_stock jsonb;
  v_matrix_stock jsonb;
  v_lines jsonb;
  v_coupon_store record;
  v_coupon_id uuid;
  v_coupon record;
  v_coupon_selection record;
  v_store_subtotal numeric;
  v_coupon_amount numeric;
  v_coupon_ratio numeric;
  v_coupon_unit bigint;
  v_expiry timestamptz;
  v_now timestamptz:=clock_timestamp();
begin
  v_customer:=private.require_customer_review_session(p_session_token)::text;
  if coalesce(v_customer,'')='' then raise exception 'PAYMENT_CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  if p_quote_id is null or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'PAYMENT_RESERVATION_INVALID_INPUT' using errcode='22023';
  end if;

  select * into v_quote from public.kinto_payment_quotes_g20
   where id=p_quote_id and customer_id=v_customer for update;
  if not found then raise exception 'PAYMENT_QUOTE_NOT_FOUND' using errcode='P0002'; end if;
  if v_quote.expires_at<=v_now or v_quote.status in ('expired','cancelled','consumed') then
    raise exception 'PAYMENT_QUOTE_EXPIRED' using errcode='22023';
  end if;
  if v_quote.currency is null or v_quote.amount is null or v_quote.amount<=0 then
    raise exception 'PAYMENT_MIXED_CURRENCY_MANUAL_ONLY' using errcode='22023';
  end if;

  select * into v_reservation from public.kinto_stock_reservations_g20
   where quote_id=p_quote_id for update;
  if found then
    if v_reservation.customer_id<>v_customer or v_reservation.idempotency_key<>p_idempotency_key then
      raise exception 'PAYMENT_RESERVATION_ALREADY_EXISTS' using errcode='23505';
    end if;
    if v_reservation.status='active' and v_reservation.expires_at>v_now then
      return jsonb_build_object('reservation_id',v_reservation.id,'quote_id',p_quote_id,
        'status',v_reservation.status,'expires_at',v_reservation.expires_at,'reused',true);
    end if;
    raise exception 'PAYMENT_RESERVATION_NOT_REUSABLE' using errcode='22023';
  end if;

  v_lines:=v_quote.quote_snapshot->'lines';
  if jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines)<1 then
    raise exception 'PAYMENT_QUOTE_SNAPSHOT_INVALID';
  end if;
  v_expiry:=v_now+interval '15 minutes';
  select max_order_ratio,coupon_unit into v_coupon_ratio,v_coupon_unit
    from public.kinto_loyalty_settings where id=1;
  if v_coupon_ratio is null or v_coupon_unit is null or v_coupon_unit<=0 then
    raise exception 'PAYMENT_LOYALTY_SETTINGS_UNAVAILABLE';
  end if;

  -- Deterministic product row lock: serialize competing electronic holds.
  for v_product_id in
    select distinct (item->>'product_id')::uuid
      from jsonb_array_elements(v_lines) q(item)
     order by (item->>'product_id')::uuid
  loop
    perform 1 from public.local_products p where p.id=v_product_id for update;
    if not found then raise exception 'PAYMENT_PRODUCT_NOT_FOUND'; end if;
  end loop;

  -- Freeze the quote only if every current V97 pricing input still matches.
  -- A changed vendor price, commission, FX rate, currency or product price means
  -- the customer must receive a fresh review before any hold is placed.
  for v_price in
    select item->>'product_id' as product_id,item->>'store_id' as store_id,
      (item->>'unit_price_minor')::numeric as quoted_unit,
      (item->'pricing_snapshot'->>'vendor_price_usd')::numeric as quoted_vendor,
      (item->'pricing_snapshot'->>'commission_rate')::numeric as quoted_commission,
      (item->'pricing_snapshot'->>'exchange_rate')::numeric as quoted_exchange,
      upper(item->>'currency') as quoted_currency,
      ceil((ceil(coalesce(p.discount_price,p.base_price)::numeric/(1-coalesce(s.commission_rate,10)::numeric/100))*s.exchange_rate::numeric)/1000)*1000 as current_unit,
      coalesce(p.discount_price,p.base_price)::numeric as current_vendor,
      coalesce(s.commission_rate,10)::numeric as current_commission,
      s.exchange_rate::numeric as current_exchange,
      upper(coalesce(nullif(s.exchange_target_currency,''),nullif(s.default_currency,''),'IQD')) as current_currency
    from jsonb_array_elements(v_lines) q(item)
    join public.local_products p on p.id=(item->>'product_id')::uuid and p.store_id=(item->>'store_id')::uuid
    join public.local_stores s on s.id=p.store_id
  loop
    if v_price.quoted_unit is distinct from v_price.current_unit
       or v_price.quoted_vendor is distinct from v_price.current_vendor
       or v_price.quoted_commission is distinct from v_price.current_commission
       or v_price.quoted_exchange is distinct from v_price.current_exchange
       or v_price.quoted_currency is distinct from v_price.current_currency then
      raise exception 'PAYMENT_QUOTE_STALE_REVIEW_AGAIN' using errcode='22023';
    end if;
  end loop;

  -- Current total stock minus unexpired electronic holds. No physical decrement.
  for v_product in
    select p.id,p.stock_quantity,p.is_out_of_stock,coalesce(p.options,'{}'::jsonb) as options,
      sum((item->>'quantity')::integer)::integer as requested
      from jsonb_array_elements(v_lines) q(item)
      join public.local_products p on p.id=(item->>'product_id')::uuid
     group by p.id,p.stock_quantity,p.is_out_of_stock,p.options order by p.id
  loop
    if coalesce(v_product.is_out_of_stock,false) then raise exception 'PAYMENT_PRODUCT_UNAVAILABLE'; end if;
    if v_product.stock_quantity is not null then
      select coalesce(sum(l.quantity),0)::integer into v_held
        from public.kinto_stock_reservation_lines_g20 l
        join public.kinto_stock_reservations_g20 r on r.id=l.reservation_id
       where l.product_id=v_product.id and r.status='active' and r.expires_at>v_now;
      if not private.kinto_stock_available_g20c(v_product.stock_quantity,v_held,v_product.requested) then
        raise exception 'PAYMENT_RESERVATION_INSUFFICIENT_PRODUCT_STOCK';
      end if;
    end if;
    if exists(select 1 from jsonb_array_elements(v_lines) q(item)
      where (item->>'product_id')::uuid=v_product.id
        and not private.kinto_payment_options_valid_g20(v_product.options,coalesce(item->'selected_options','{}'::jsonb))) then
      raise exception 'PAYMENT_RESERVATION_INVALID_VARIANT';
    end if;
  end loop;

  -- Subtract active holds independently for every configured color/size/volume bucket.
  for v_variant in
    select (item->>'product_id')::uuid as product_id,d.dimension,d.choice,
      sum((item->>'quantity')::integer)::integer as requested
      from jsonb_array_elements(v_lines) q(item)
      cross join lateral (values
        ('color'::text,nullif(btrim(item->'selected_options'->>'color'),'')),
        ('size'::text,nullif(btrim(item->'selected_options'->>'size'),'')),
        ('volume'::text,nullif(btrim(item->'selected_options'->>'volume'),''))
      ) d(dimension,choice)
     where d.choice is not null group by 1,2,3 order by 1,2,3
  loop
    select coalesce(p.options->'variant_stock'->v_variant.dimension,
      p.options->'variant_stock'->(v_variant.dimension||'s')) into v_variant_stock
      from public.local_products p where p.id=v_variant.product_id;
    if jsonb_typeof(v_variant_stock)='object' and v_variant_stock ? v_variant.choice then
      if coalesce(v_variant_stock->>v_variant.choice,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_VARIANT_STOCK_INVALID'; end if;
      v_stock:=(v_variant_stock->>v_variant.choice)::integer;
      select coalesce(sum(l.quantity),0)::integer into v_held
        from public.kinto_stock_reservation_lines_g20 l
        join public.kinto_stock_reservations_g20 r on r.id=l.reservation_id
       where l.product_id=v_variant.product_id and r.status='active' and r.expires_at>v_now
         and coalesce(l.selected_options->>v_variant.dimension,'')=v_variant.choice;
      if not private.kinto_stock_available_g20c(v_stock,v_held,v_variant.requested) then raise exception 'PAYMENT_RESERVATION_INSUFFICIENT_VARIANT_STOCK'; end if;
    end if;
  end loop;

  -- matrix_stock holds use exactly the V47 normalized combination key.
  for v_matrix in
    select (item->>'product_id')::uuid as product_id,
      public.meshwar_matrix_stock_key(coalesce(item->'selected_options','{}'::jsonb)) as matrix_key,
      sum((item->>'quantity')::integer)::integer as requested
      from jsonb_array_elements(v_lines) q(item)
     group by 1,2 order by 1,2
  loop
    select coalesce(p.options->'matrix_stock','{}'::jsonb) into v_matrix_stock
      from public.local_products p where p.id=v_matrix.product_id;
    if jsonb_typeof(v_matrix_stock)='object' and v_matrix_stock<>'{}'::jsonb then
      if v_matrix.matrix_key is null or not (v_matrix_stock ? v_matrix.matrix_key) then
        raise exception 'PAYMENT_RESERVATION_MATRIX_COMBINATION_REQUIRED';
      end if;
      if coalesce(v_matrix_stock->>v_matrix.matrix_key,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_MATRIX_STOCK_INVALID'; end if;
      v_stock:=(v_matrix_stock->>v_matrix.matrix_key)::integer;
      select coalesce(sum(l.quantity),0)::integer into v_held
        from public.kinto_stock_reservation_lines_g20 l
        join public.kinto_stock_reservations_g20 r on r.id=l.reservation_id
       where l.product_id=v_matrix.product_id and l.matrix_key=v_matrix.matrix_key
         and r.status='active' and r.expires_at>v_now;
      if not private.kinto_stock_available_g20c(v_stock,v_held,v_matrix.requested) then raise exception 'PAYMENT_RESERVATION_INSUFFICIENT_MATRIX_STOCK'; end if;
    end if;
  end loop;

  -- Coupon IDs chosen by the quote are held too; the coupon itself stays active
  -- until a future verified-payment finalizer consumes it.
  update public.kinto_coupon_reservations_g20 set status='expired'
   where status='active' and expires_at<=v_now;

  for v_coupon_selection in select key,value from jsonb_each_text(
      coalesce(v_quote.quote_snapshot->'coupon_selection','{}'::jsonb)) order by key loop
    if v_coupon_selection.value !~ '^[0-9]+$' then raise exception 'PAYMENT_QUOTE_COUPON_SNAPSHOT_INVALID'; end if;
    v_coupon_amount:=v_coupon_selection.value::numeric;
    select (s->>'subtotal_minor')::numeric into v_store_subtotal
      from jsonb_array_elements(v_quote.quote_snapshot->'stores') s
     where s->>'store_id'=v_coupon_selection.key and s->>'currency'='IQD';
    if v_store_subtotal is null or v_coupon_amount>
      floor(v_store_subtotal*v_coupon_ratio/v_coupon_unit)*v_coupon_unit then
      raise exception 'PAYMENT_COUPON_STORE_LIMIT_CHANGED';
    end if;
    if (select jsonb_array_length(coalesce(v_quote.quote_snapshot->'coupon_ids'->v_coupon_selection.key,'[]'::jsonb)))
       <> (v_coupon_amount/v_coupon_unit)::integer then
      raise exception 'PAYMENT_QUOTE_COUPON_SNAPSHOT_INVALID';
    end if;
  end loop;

  insert into public.kinto_stock_reservations_g20(quote_id,customer_id,idempotency_key,expires_at)
    values(p_quote_id,v_customer,p_idempotency_key,v_expiry) returning * into v_reservation;
  insert into public.kinto_stock_reservation_lines_g20(reservation_id,product_id,selected_options,matrix_key,quantity)
    select v_reservation.id,(item->>'product_id')::uuid,coalesce(item->'selected_options','{}'::jsonb),
      public.meshwar_matrix_stock_key(coalesce(item->'selected_options','{}'::jsonb)),(item->>'quantity')::integer
      from jsonb_array_elements(v_lines) q(item);

  for v_coupon_store in select key,value from jsonb_each(coalesce(v_quote.quote_snapshot->'coupon_ids','{}'::jsonb)) order by key loop
    if jsonb_typeof(v_coupon_store.value) is distinct from 'array' then raise exception 'PAYMENT_QUOTE_COUPON_SNAPSHOT_INVALID'; end if;
    for v_coupon_id in select value::uuid from jsonb_array_elements_text(v_coupon_store.value) order by value::uuid loop
      select * into v_coupon from public.kinto_loyalty_coupons c where c.id=v_coupon_id for update;
      if not found or v_coupon.customer_id::text<>v_customer or v_coupon.currency<>'IQD' or v_coupon.status<>'active' or v_coupon.expires_at<=v_now then
        raise exception 'PAYMENT_COUPON_NO_LONGER_AVAILABLE';
      end if;
      if not ((v_coupon.campaign_id is null and v_coupon.store_id::text=v_coupon_store.key)
        or (v_coupon.campaign_id is not null and exists(
          select 1 from public.kinto_campaign_stores cs join public.kinto_campaigns ca on ca.id=cs.campaign_id
           where cs.campaign_id=v_coupon.campaign_id and cs.store_id::text=v_coupon_store.key and ca.status<>'cancelled'))) then
        raise exception 'PAYMENT_COUPON_STORE_SCOPE_INVALID';
      end if;
      insert into public.kinto_coupon_reservations_g20(reservation_id,coupon_id,expires_at)
        values(v_reservation.id,v_coupon_id,v_expiry);
    end loop;
  end loop;

  update public.kinto_payment_quotes_g20 set status='reserved' where id=p_quote_id and status='preview';
  if not found then raise exception 'PAYMENT_QUOTE_ALREADY_RESERVED'; end if;
  return jsonb_build_object('reservation_id',v_reservation.id,'quote_id',p_quote_id,
    'status','active','expires_at',v_expiry,'reused',false,'physical_stock_changed',false);
end;
$reserve$;
revoke all on function public.kinto_stock_reserve_g20(text,uuid,text) from public;
grant execute on function public.kinto_stock_reserve_g20(text,uuid,text) to anon,authenticated;

create or replace function public.kinto_stock_release_g20(
  p_session_token text,
  p_reservation_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,extensions,pg_temp
as $release$
declare
  v_customer text;
  v_reservation public.kinto_stock_reservations_g20%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  v_customer:=private.require_customer_review_session(p_session_token)::text;
  if coalesce(v_customer,'')='' then raise exception 'PAYMENT_CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  if p_reason not in ('payment_failed','customer_cancelled') then raise exception 'PAYMENT_RELEASE_REASON_INVALID' using errcode='22023'; end if;
  select * into v_reservation from public.kinto_stock_reservations_g20
   where id=p_reservation_id and customer_id=v_customer for update;
  if not found then raise exception 'PAYMENT_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
  if v_reservation.status='released' then
    return jsonb_build_object('reservation_id',p_reservation_id,'status','released','reused',true);
  end if;
  if v_reservation.status<>'active' then raise exception 'PAYMENT_RESERVATION_NOT_ACTIVE'; end if;
  update public.kinto_stock_reservations_g20 set status='released',released_at=v_now,release_reason=p_reason where id=p_reservation_id;
  update public.kinto_coupon_reservations_g20 set status='released' where reservation_id=p_reservation_id and status='active';
  update public.kinto_payment_quotes_g20 set status='cancelled' where id=v_reservation.quote_id and status='reserved';
  return jsonb_build_object('reservation_id',p_reservation_id,'status','released','reused',false,'physical_stock_changed',false);
end;
$release$;
revoke all on function public.kinto_stock_release_g20(text,uuid,text) from public;
grant execute on function public.kinto_stock_release_g20(text,uuid,text) to anon,authenticated;

comment on table public.kinto_stock_reservations_g20 is
'G20-C temporary electronic checkout holds. Holds reduce electronic available-to-sell only; no local_products/order mutation. V47 remains the sole physical stock deduction path.';
comment on function public.kinto_stock_reserve_g20(text,uuid,text) is
'G20-C reserve quote stock and selected IQD coupons for 15 minutes using ordered product locks and idempotency. No order/payment intent is created.';
comment on function public.kinto_stock_release_g20(text,uuid,text) is
'G20-C releases a customer-owned failed/cancelled reservation; does not mutate coupons, orders, or physical stock.';

notify pgrst,'reload schema';
commit;
