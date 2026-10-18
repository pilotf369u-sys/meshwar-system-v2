-- Synthetic reduced KINTO schema for isolated G21 SQL integration tests.
-- No production data or credentials are used.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema private;
create schema extensions;

create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'')
$$;

create function private.v94_uuid(text) returns uuid language plpgsql immutable as $$
begin return $1::uuid; exception when others then return null; end $$;
create function private.v94_jsonb_object(jsonb) returns jsonb language plpgsql immutable as $$
declare v jsonb;
begin
  if jsonb_typeof($1)='object' then return $1; end if;
  if jsonb_typeof($1)='string' then
    begin v:=($1#>>'{}')::jsonb; if jsonb_typeof(v)='object' then return v; end if;
    exception when others then return '{}'::jsonb; end;
  end if;
  return '{}'::jsonb;
end $$;
create function private.require_customer_review_session(text) returns text language plpgsql stable as $$
begin if $1<>'customer-token' then raise exception 'CUSTOMER_SESSION_INVALID'; end if; return 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; end $$;
create table public.customers(id uuid primary key,name text,phone text);
create table public.local_stores(
  id uuid primary key,store_name text,status text default 'active',commission_rate numeric default 0,
  exchange_rate numeric default 1,exchange_target_currency text default 'IQD',default_currency text default 'IQD'
);
create table public.local_products(
  id uuid primary key,store_id uuid not null references public.local_stores(id),product_name text,
  image_url text,base_price numeric,discount_price numeric,stock_quantity integer,
  is_out_of_stock boolean default false,options jsonb default '{}'::jsonb
);
create table public.order_store_segments(
  order_id uuid,store_id uuid,items_snapshot jsonb,quantity_total integer,subtotal_local numeric,
  commission_snapshot jsonb,vendor_payment_status text,updated_at timestamptz
);
create table public.orders(
  id uuid primary key default gen_random_uuid(),customer_id uuid,customer_name text,customer_phone text,
  status text not null,total_price numeric not null,currency text default 'IQD',details text,
  order_url text,delivery_fee numeric default 0,delivery_currency text,shipping_company_name text,
  shipping_snapshot jsonb default '{}'::jsonb,reward_discount_amount numeric default 0,
  loyalty_points_redeemed bigint default 0,reward_discount_currency text,
  reward_discount_snapshot jsonb default '{}'::jsonb,loyalty_points_earned bigint default 0,
  order_code text,reference_order_no text,created_at timestamptz default now()
);
create table public.test_v101_calls(customer_id uuid,customer_name text,customer_phone text,shipping jsonb,items jsonb);
create or replace function public.kinto_order_store_id_v310(p_order public.orders) returns text
language sql stable as $$ select coalesce(p_order.details::jsonb->>'store_id','') $$;

create table public.kinto_loyalty_settings(
  id smallint primary key default 1,coupon_unit bigint not null default 1000,max_order_ratio numeric not null default .10
);
insert into public.kinto_loyalty_settings(id) values(1);
create table public.kinto_loyalty_coupons(
  id uuid primary key default gen_random_uuid(),customer_id text not null,store_id text not null,currency text not null,
  points bigint not null default 1000,status text not null default 'active',issued_at timestamptz default now(),
  expires_at timestamptz not null,used_order_id text,used_at timestamptz,funded_by text default 'vendor',campaign_id uuid
);
create table public.kinto_campaigns(id uuid primary key,status text not null);
create table public.kinto_campaign_stores(campaign_id uuid,store_id text);
create table public.kinto_loyalty_ledger(
  id uuid primary key default gen_random_uuid(),customer_id text,store_id text,order_id text,event_type text,
  points bigint,currency text,eligible_product_total numeric,note text,funded_by text,funding_snapshot jsonb default '{}'::jsonb
);

create table public.kinto_payment_settings_g16(
  singleton boolean primary key default true,gateways_enabled boolean default false,payment_mode text default 'electronic',
  gateway_environment text default 'sandbox',new_payments_paused boolean default false,
  active_gateway_provider text,new_payments_pause_reason text,new_payments_paused_by text,new_payments_paused_at timestamptz,
  updated_at timestamptz default now()
);
create table public.kinto_payment_settings_audit_g16(id bigint generated always as identity primary key,actor_id text,action text,old_value text,new_value text);
create table public.kinto_payment_gateway_providers_g18(
  provider_key text primary key,display_name text,checkout_protocol text,adapter_version text,environment text,
  enabled boolean,new_payments_paused boolean default true,pause_reason text,secret_name text,public_config jsonb default '{}'::jsonb
);
create table public.kinto_payment_intents_g18(
  id uuid primary key default gen_random_uuid(),payment_reference text unique default gen_random_uuid()::text,
  customer_id text not null,quote_id uuid not null,checkout_group_id uuid,provider_key text not null,
  provider_environment text not null,provider_adapter_version text not null,provider_reference text,
  amount_minor bigint not null,currency text not null,status text not null default 'captured',
  idempotency_key text not null,reservation_expires_at timestamptz,provider_snapshot jsonb default '{}'::jsonb,
  created_at timestamptz default now(),updated_at timestamptz default now(),unique(customer_id,idempotency_key)
);
create table public.kinto_payment_gateway_events_g18(
  id bigint generated always as identity primary key,provider_key text not null,provider_event_id text not null,
  intent_id uuid references public.kinto_payment_intents_g18(id),event_type text not null,event_fingerprint text not null,
  signature_verified boolean default false,amount_minor bigint,currency text,processing_status text default 'received',
  received_at timestamptz default now(),processed_at timestamptz,unique(provider_key,provider_event_id)
);
create table public.kinto_payment_financial_events_g18(
  id bigint generated always as identity primary key,intent_id uuid not null references public.kinto_payment_intents_g18(id),
  event_kind text not null,provider_key text not null,provider_reference text,provider_event_id text,
  amount_minor bigint not null,currency text not null,idempotency_key text not null unique,
  metadata jsonb default '{}'::jsonb,created_at timestamptz default now()
);
create table public.kinto_payment_quotes_g20(
  id uuid primary key default gen_random_uuid(),customer_id text not null,cart_fingerprint text,
  currency text,amount numeric,quote_snapshot jsonb not null,status text not null default 'reserved',
  expires_at timestamptz not null,created_at timestamptz default now()
);
create table public.kinto_stock_reservations_g20(
  id uuid primary key default gen_random_uuid(),quote_id uuid unique not null references public.kinto_payment_quotes_g20(id),
  customer_id text not null,idempotency_key text,status text not null default 'active',
  created_at timestamptz default now(),expires_at timestamptz not null,released_at timestamptz,release_reason text
);
create table public.kinto_stock_reservation_lines_g20(
  id bigint generated always as identity primary key,reservation_id uuid not null references public.kinto_stock_reservations_g20(id),
  product_id uuid not null references public.local_products(id),selected_options jsonb default '{}'::jsonb,matrix_key text,quantity integer not null
);
create table public.kinto_coupon_reservations_g20(
  id bigint generated always as identity primary key,reservation_id uuid not null references public.kinto_stock_reservations_g20(id),
  coupon_id uuid not null references public.kinto_loyalty_coupons(id),status text not null default 'active',
  expires_at timestamptz not null,created_at timestamptz default now(),unique(reservation_id,coupon_id)
);
create unique index kinto_coupon_reservations_g20_one_active_idx
  on public.kinto_coupon_reservations_g20(coupon_id) where status='active';
create table private.kinto_paid_transition_permits_v1(transaction_id bigint,order_id uuid,primary key(transaction_id,order_id));

create or replace function public.kinto_normalize_currency_v310(text) returns text
language sql immutable as $$ select upper(coalesce($1,'IQD')) $$;

create or replace function public.meshwar_matrix_stock_key(jsonb) returns text
language plpgsql immutable as $$
declare parts text[]:=array[]::text[];v text;
begin
  v:=coalesce(nullif($1->>'color',''),nullif($1->>'selected_color','')); if v is not null and btrim(v)<>'' then parts:=array_append(parts,btrim(v)); end if;
  v:=coalesce(nullif($1->>'size',''),nullif($1->>'selected_size','')); if v is not null and btrim(v)<>'' then parts:=array_append(parts,btrim(v)); end if;
  v:=coalesce(nullif($1->>'volume',''),nullif($1->>'selected_volume','')); if v is not null and btrim(v)<>'' then parts:=array_append(parts,btrim(v)); end if;
  if cardinality(parts)<2 then return null; end if; return array_to_string(parts,'_');
end $$;
create or replace function public.meshwar_adjust_variant_stock(jsonb,jsonb,integer,integer) returns jsonb
language plpgsql as $$
declare result jsonb:=coalesce($1,'{}'::jsonb); d text;choice text;stock jsonb;next_qty integer;
begin
  stock:=coalesce(result->'variant_stock','{}'::jsonb);
  foreach d in array array['color','size','volume'] loop
    choice:=nullif(btrim($2->>d),''); if choice is null then continue; end if;
    if jsonb_typeof(stock->d)='object' and stock->d ? choice then
      next_qty:=(stock->d->>choice)::integer+($3*$4);
      if next_qty<0 then raise exception 'Insufficient variant stock'; end if;
      stock:=jsonb_set(stock,array[d,choice],to_jsonb(next_qty),false);
    end if;
  end loop;
  return jsonb_set(result,'{variant_stock}',stock,true);
end $$;
create or replace function public.meshwar_adjust_matrix_stock(jsonb,jsonb,integer,integer) returns jsonb
language plpgsql as $$
declare result jsonb:=coalesce($1,'{}'::jsonb);matrix jsonb;key text;next_qty integer;
begin
  matrix:=coalesce(result->'matrix_stock','{}'::jsonb);key:=public.meshwar_matrix_stock_key($2);
  if key is null or jsonb_typeof(matrix)<>'object' or not (matrix ? key) then return result; end if;
  next_qty:=(matrix->>key)::integer+($3*$4); if next_qty<0 then raise exception 'Insufficient matrix stock'; end if;
  matrix:=jsonb_set(matrix,array[key],to_jsonb(next_qty),false); return jsonb_set(result,'{matrix_stock}',matrix,true);
end $$;

create or replace function private.kinto_paid_transition_guard_v1() returns trigger language plpgsql as $$
begin
  if new.status='تم التسديد' and old.status is distinct from new.status and not exists(
    select 1 from private.kinto_paid_transition_permits_v1 p where p.transaction_id=txid_current() and p.order_id=new.id
  ) then raise exception 'KINTO_PAYMENT_APPROVAL_REQUIRED' using errcode='42501'; end if;
  return new;
end $$;
create trigger trg_kinto_paid_transition_guard_v1 after update on public.orders
for each row execute function private.kinto_paid_transition_guard_v1();
