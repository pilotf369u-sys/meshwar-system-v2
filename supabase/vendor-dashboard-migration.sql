-- MeshWar Local Stores - Vendor Dashboard support
-- Isolated migration: no changes to legacy admin/orders tables.

begin;

create extension if not exists pgcrypto;

alter table public.local_stores
  add column if not exists exchange_rate numeric(18,6) not null default 1,
  add column if not exists exchange_base_currency text not null default 'USD',
  add column if not exists exchange_target_currency text not null default 'IQD';

alter table public.local_products
  add column if not exists stock_quantity integer not null default 0,
  add column if not exists low_stock_threshold integer not null default 3,
  add column if not exists options jsonb not null default '{"colors":[],"sizes":[],"volumes":[]}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.local_products
  drop constraint if exists local_products_stock_quantity_valid,
  add constraint local_products_stock_quantity_valid check (stock_quantity >= 0),
  drop constraint if exists local_products_low_stock_threshold_valid,
  add constraint local_products_low_stock_threshold_valid check (low_stock_threshold >= 0);

create index if not exists idx_local_products_store_stock_qty
  on public.local_products(store_id, stock_quantity);

-- Vendor login RPC: prevents the dashboard from selecting password_hash directly.
-- Supports pgcrypto hashes, SHA-256 hex, and legacy plain-text values for compatibility.
create or replace function public.vendor_login(
  p_identity text,
  p_password text
)
returns table (
  id uuid,
  store_name text,
  logo_url text,
  username text,
  phone text,
  country text,
  governorate text,
  store_type text,
  specialty text,
  default_currency text,
  commission_rate numeric,
  status text,
  exchange_rate numeric,
  exchange_base_currency text,
  exchange_target_currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.local_stores%rowtype;
  v_ok boolean := false;
begin
  if nullif(trim(p_identity), '') is null or coalesce(p_password, '') = '' then
    return;
  end if;

  select * into v_store
  from public.local_stores s
  where lower(trim(s.username)) = lower(trim(p_identity))
     or trim(s.phone) = trim(p_identity)
  limit 1;

  if v_store.id is null or v_store.status <> 'active' then
    return;
  end if;

  if v_store.password_hash is not null then
    begin
      v_ok := crypt(p_password, v_store.password_hash) = v_store.password_hash;
    exception when others then
      v_ok := false;
    end;

    if not v_ok then
      v_ok := lower(v_store.password_hash) = encode(digest(p_password, 'sha256'), 'hex');
    end if;

    if not v_ok then
      v_ok := v_store.password_hash = p_password;
    end if;
  end if;

  if not v_ok then
    return;
  end if;

  return query
  select
    v_store.id,
    v_store.store_name,
    v_store.logo_url,
    v_store.username,
    v_store.phone,
    v_store.country,
    v_store.governorate,
    v_store.store_type,
    v_store.specialty,
    v_store.default_currency,
    v_store.commission_rate,
    v_store.status,
    v_store.exchange_rate,
    v_store.exchange_base_currency,
    v_store.exchange_target_currency;
end;
$$;

revoke all on function public.vendor_login(text,text) from public;
grant execute on function public.vendor_login(text,text) to anon, authenticated;

-- Stores a vendor's central exchange configuration. The storefront can use this
-- rate to display all product prices in the selected target currency without
-- destructively rewriting each product's original price.
create or replace function public.vendor_set_exchange_rate(
  p_store_id uuid,
  p_rate numeric,
  p_base_currency text,
  p_target_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'Exchange rate must be greater than zero';
  end if;

  update public.local_stores
  set exchange_rate = p_rate,
      exchange_base_currency = nullif(trim(p_base_currency), ''),
      exchange_target_currency = nullif(trim(p_target_currency), '')
  where id = p_store_id;

  if not found then
    raise exception 'Store not found';
  end if;
end;
$$;

revoke all on function public.vendor_set_exchange_rate(uuid,numeric,text,text) from public;
grant execute on function public.vendor_set_exchange_rate(uuid,numeric,text,text) to anon, authenticated;

commit;
