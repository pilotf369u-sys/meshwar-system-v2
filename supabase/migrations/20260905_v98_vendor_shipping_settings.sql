-- V98 phase 2: vendor-owned shipping companies and destination rates.
-- A resolved quote is snapshotted on each independent order before INSERT.

begin;

create extension if not exists pgcrypto;

create table if not exists public.vendor_shipping_profiles (
  store_id uuid primary key references public.local_stores(id) on delete cascade,
  is_active boolean not null default false,
  default_currency text not null default 'IQD',
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_shipping_profile_currency check (default_currency ~ '^[A-Z]{3,5}$')
);

create table if not exists public.vendor_shipping_companies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.local_stores(id) on delete cascade,
  company_name text not null,
  phone text,
  tracking_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_shipping_company_name check (length(trim(company_name)) between 1 and 120),
  constraint vendor_shipping_tracking_url check (tracking_url is null or tracking_url ~* '^https?://')
);

create index if not exists idx_vendor_shipping_companies_store
  on public.vendor_shipping_companies(store_id, is_active, sort_order, created_at);

create table if not exists public.vendor_shipping_rates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.local_stores(id) on delete cascade,
  company_id uuid not null references public.vendor_shipping_companies(id) on delete cascade,
  destination_country text not null default '*',
  governorate text not null,
  area text not null default '*',
  delivery_fee numeric(18,2) not null,
  currency text not null,
  estimated_days_min integer,
  estimated_days_max integer,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_shipping_rate_fee check (delivery_fee >= 0),
  constraint vendor_shipping_rate_currency check (currency ~ '^[A-Z]{3,5}$'),
  constraint vendor_shipping_rate_governorate check (length(trim(governorate)) between 1 and 120),
  constraint vendor_shipping_rate_days check (
    (estimated_days_min is null or estimated_days_min >= 0)
    and (estimated_days_max is null or estimated_days_max >= coalesce(estimated_days_min, 0))
  )
);

create index if not exists idx_vendor_shipping_rates_match
  on public.vendor_shipping_rates(store_id, is_active, lower(destination_country), lower(governorate), lower(area), priority desc);

create unique index if not exists uq_vendor_shipping_rate_scope
  on public.vendor_shipping_rates(
    store_id,
    company_id,
    lower(trim(destination_country)),
    lower(trim(governorate)),
    lower(trim(area))
  );

alter table public.vendor_shipping_profiles enable row level security;
alter table public.vendor_shipping_companies enable row level security;
alter table public.vendor_shipping_rates enable row level security;
revoke all on public.vendor_shipping_profiles from public, anon, authenticated;
revoke all on public.vendor_shipping_companies from public, anon, authenticated;
revoke all on public.vendor_shipping_rates from public, anon, authenticated;

alter table public.orders
  add column if not exists delivery_fee numeric(18,2) not null default 0,
  add column if not exists delivery_currency text,
  add column if not exists shipping_company_name text,
  add column if not exists shipping_snapshot jsonb not null default '{}'::jsonb;

create or replace function private.v98_vendor_shipping_settings(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'store_id', p_store_id,
    'is_active', coalesce(p.is_active, false),
    'default_currency', coalesce(p.default_currency, s.exchange_target_currency, s.default_currency, 'IQD'),
    'version', coalesce(p.version, 0),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', c.id::text,
        'id', c.id,
        'company_name', c.company_name,
        'phone', c.phone,
        'tracking_url', c.tracking_url,
        'is_active', c.is_active,
        'sort_order', c.sort_order
      ) order by c.sort_order, c.created_at)
      from public.vendor_shipping_companies c
      where c.store_id = p_store_id
    ), '[]'::jsonb),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'company_key', r.company_id::text,
        'destination_country', r.destination_country,
        'governorate', r.governorate,
        'area', r.area,
        'delivery_fee', r.delivery_fee,
        'currency', r.currency,
        'estimated_days_min', r.estimated_days_min,
        'estimated_days_max', r.estimated_days_max,
        'priority', r.priority,
        'is_active', r.is_active
      ) order by r.priority desc, r.created_at)
      from public.vendor_shipping_rates r
      where r.store_id = p_store_id
    ), '[]'::jsonb)
  )
  from public.local_stores s
  left join public.vendor_shipping_profiles p on p.store_id = s.id
  where s.id = p_store_id;
$$;

create or replace function public.vendor_get_shipping_settings(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
begin
  return private.v98_vendor_shipping_settings(v_store_id);
end;
$$;

create or replace function public.vendor_save_shipping_settings(
  p_session_token text,
  p_expected_version bigint,
  p_is_active boolean,
  p_default_currency text,
  p_companies jsonb,
  p_rates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_profile public.vendor_shipping_profiles%rowtype;
  v_company jsonb;
  v_rate jsonb;
  v_company_key text;
  v_company_id uuid;
  v_company_map jsonb := '{}'::jsonb;
  v_currency text := upper(trim(coalesce(p_default_currency, '')));
begin
  if jsonb_typeof(coalesce(p_companies, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_rates, '[]'::jsonb)) <> 'array' then
    raise exception 'SHIPPING_SETTINGS_ARRAYS_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_companies, '[]'::jsonb)) > 30
     or jsonb_array_length(coalesce(p_rates, '[]'::jsonb)) > 300 then
    raise exception 'SHIPPING_SETTINGS_LIMIT_EXCEEDED' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3,5}$' then
    raise exception 'SHIPPING_CURRENCY_INVALID' using errcode = '22023';
  end if;
  if coalesce(p_is_active, false)
     and (jsonb_array_length(coalesce(p_companies, '[]'::jsonb)) = 0
       or jsonb_array_length(coalesce(p_rates, '[]'::jsonb)) = 0) then
    raise exception 'ACTIVE_SHIPPING_REQUIRES_COMPANY_AND_RATE' using errcode = '22023';
  end if;

  insert into public.vendor_shipping_profiles(store_id, is_active, default_currency)
  values (v_store_id, false, v_currency)
  on conflict (store_id) do nothing;

  select * into v_profile
  from public.vendor_shipping_profiles
  where store_id = v_store_id
  for update;

  if v_profile.version <> coalesce(p_expected_version, -1) then
    raise exception 'SHIPPING_SETTINGS_VERSION_CONFLICT' using errcode = '40001';
  end if;

  delete from public.vendor_shipping_rates where store_id = v_store_id;
  delete from public.vendor_shipping_companies where store_id = v_store_id;

  for v_company in
    select value from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb))
  loop
    v_company_key := nullif(trim(v_company ->> 'key'), '');
    if v_company_key is null
       or nullif(trim(v_company ->> 'company_name'), '') is null
       or v_company_map ? v_company_key then
      raise exception 'SHIPPING_COMPANY_INVALID_OR_DUPLICATE' using errcode = '22023';
    end if;
    v_company_id := gen_random_uuid();
    insert into public.vendor_shipping_companies(
      id, store_id, company_name, phone, tracking_url, is_active, sort_order
    ) values (
      v_company_id,
      v_store_id,
      trim(v_company ->> 'company_name'),
      nullif(trim(v_company ->> 'phone'), ''),
      nullif(trim(v_company ->> 'tracking_url'), ''),
      coalesce((v_company ->> 'is_active')::boolean, true),
      greatest(0, private.v94_numeric(v_company ->> 'sort_order', 0)::integer)
    );
    v_company_map := v_company_map || jsonb_build_object(v_company_key, v_company_id::text);
  end loop;

  for v_rate in
    select value from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb))
  loop
    v_company_key := nullif(trim(v_rate ->> 'company_key'), '');
    if v_company_key is null or not (v_company_map ? v_company_key) then
      raise exception 'SHIPPING_RATE_COMPANY_INVALID' using errcode = '22023';
    end if;
    if nullif(trim(v_rate ->> 'governorate'), '') is null
       or private.v94_numeric(v_rate ->> 'delivery_fee', -1) < 0 then
      raise exception 'SHIPPING_RATE_INVALID' using errcode = '22023';
    end if;
    v_currency := upper(trim(coalesce(nullif(v_rate ->> 'currency', ''), p_default_currency)));
    if v_currency !~ '^[A-Z]{3,5}$' then
      raise exception 'SHIPPING_RATE_CURRENCY_INVALID' using errcode = '22023';
    end if;

    insert into public.vendor_shipping_rates(
      store_id, company_id, destination_country, governorate, area,
      delivery_fee, currency, estimated_days_min, estimated_days_max,
      priority, is_active
    ) values (
      v_store_id,
      (v_company_map ->> v_company_key)::uuid,
      coalesce(nullif(trim(v_rate ->> 'destination_country'), ''), '*'),
      trim(v_rate ->> 'governorate'),
      coalesce(nullif(trim(v_rate ->> 'area'), ''), '*'),
      private.v94_numeric(v_rate ->> 'delivery_fee', 0),
      v_currency,
      case when nullif(v_rate ->> 'estimated_days_min', '') is null then null else greatest(0, private.v94_numeric(v_rate ->> 'estimated_days_min', 0)::integer) end,
      case when nullif(v_rate ->> 'estimated_days_max', '') is null then null else greatest(0, private.v94_numeric(v_rate ->> 'estimated_days_max', 0)::integer) end,
      private.v94_numeric(v_rate ->> 'priority', 0)::integer,
      coalesce((v_rate ->> 'is_active')::boolean, true)
    );
  end loop;

  update public.vendor_shipping_profiles
  set is_active = coalesce(p_is_active, false),
      default_currency = upper(trim(p_default_currency)),
      version = version + 1,
      updated_at = now()
  where store_id = v_store_id;

  return private.v98_vendor_shipping_settings(v_store_id);
end;
$$;

create or replace function private.v98_resolve_shipping_quote(
  p_store_id uuid,
  p_customer jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_profile public.vendor_shipping_profiles%rowtype;
  v_country text := lower(trim(coalesce(p_customer ->> 'country', p_customer ->> 'country_name', '')));
  v_governorate text := lower(trim(coalesce(
    p_customer ->> 'governorate', p_customer ->> 'state',
    p_customer ->> 'province', p_customer ->> 'city', ''
  )));
  v_area text := lower(trim(coalesce(
    p_customer ->> 'area', p_customer ->> 'district', p_customer ->> 'neighborhood', ''
  )));
  v_match record;
begin
  select * into v_profile
  from public.vendor_shipping_profiles
  where store_id = p_store_id;

  if v_profile.store_id is null or not v_profile.is_active then
    return jsonb_build_object(
      'profile_active', false,
      'matched', false,
      'delivery_fee', 0,
      'currency', coalesce(v_profile.default_currency, 'IQD'),
      'mode', 'unconfigured'
    );
  end if;

  select
    r.id as rate_id,
    r.delivery_fee,
    r.currency,
    r.destination_country,
    r.governorate,
    r.area,
    r.estimated_days_min,
    r.estimated_days_max,
    c.id as company_id,
    c.company_name,
    c.phone,
    c.tracking_url
  into v_match
  from public.vendor_shipping_rates r
  join public.vendor_shipping_companies c
    on c.id = r.company_id and c.store_id = r.store_id and c.is_active
  where r.store_id = p_store_id
    and r.is_active
    and (trim(r.destination_country) = '*' or lower(trim(r.destination_country)) = v_country)
    and (trim(r.governorate) = '*' or lower(trim(r.governorate)) = v_governorate)
    and (trim(r.area) = '*' or (v_area <> '' and lower(trim(r.area)) = v_area))
  order by
    (trim(r.area) <> '*') desc,
    (trim(r.governorate) <> '*') desc,
    (trim(r.destination_country) <> '*') desc,
    r.priority desc,
    r.updated_at desc
  limit 1;

  if v_match.rate_id is null then
    return jsonb_build_object(
      'profile_active', true,
      'matched', false,
      'delivery_fee', 0,
      'currency', v_profile.default_currency,
      'destination', jsonb_build_object('country', v_country, 'governorate', v_governorate, 'area', v_area)
    );
  end if;

  return jsonb_build_object(
    'profile_active', true,
    'matched', true,
    'rate_id', v_match.rate_id,
    'company_id', v_match.company_id,
    'company_name', v_match.company_name,
    'company_phone', v_match.phone,
    'tracking_url', v_match.tracking_url,
    'delivery_fee', v_match.delivery_fee,
    'currency', v_match.currency,
    'estimated_days_min', v_match.estimated_days_min,
    'estimated_days_max', v_match.estimated_days_max,
    'scope', jsonb_build_object(
      'country', v_match.destination_country,
      'governorate', v_match.governorate,
      'area', v_match.area
    ),
    'destination', jsonb_build_object('country', v_country, 'governorate', v_governorate, 'area', v_area),
    'quoted_at', now(),
    'profile_version', v_profile.version
  );
end;
$$;

create or replace function private.v98_apply_vendor_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  -- orders.details is TEXT in the live schema. Wrap it as jsonb first so the
  -- V94 compatibility parser can safely accept both TEXT-backed and JSONB-backed
  -- deployments without PostgreSQL resolving a nonexistent (text) overload.
  v_details jsonb := private.v94_jsonb_object(to_jsonb(new.details));
  v_customer jsonb := '{}'::jsonb;
  v_quote jsonb;
  v_store_id uuid;
  v_fee numeric := 0;
  v_currency text;
begin
  if coalesce(v_details ->> 'checkout_contract', '') <> 'independent_vendor_orders' then
    return new;
  end if;

  v_store_id := private.v94_uuid(v_details ->> 'store_id');
  if v_store_id is null then
    raise exception 'INDEPENDENT_ORDER_STORE_MISSING' using errcode = '22023';
  end if;

  if new.customer_id is not null then
    select coalesce(to_jsonb(c), '{}'::jsonb) into v_customer
    from public.customers c
    -- orders.customer_id is TEXT in the live schema while customers.id is UUID.
    -- Compare their canonical textual values; this also avoids casting malformed
    -- legacy customer identifiers to uuid and aborting checkout.
    where c.id::text = new.customer_id::text
    limit 1;
  end if;

  v_quote := private.v98_resolve_shipping_quote(v_store_id, coalesce(v_customer, '{}'::jsonb));
  if coalesce((v_quote ->> 'profile_active')::boolean, false)
     and not coalesce((v_quote ->> 'matched')::boolean, false) then
    raise exception 'SHIPPING_DESTINATION_UNSUPPORTED' using errcode = 'P0001';
  end if;

  v_fee := private.v94_numeric(v_quote ->> 'delivery_fee', 0);
  v_currency := upper(coalesce(nullif(v_quote ->> 'currency', ''), new.currency, 'IQD'));
  if v_fee > 0 and upper(coalesce(new.currency, '')) <> v_currency then
    raise exception 'SHIPPING_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  new.delivery_fee := v_fee;
  new.delivery_currency := v_currency;
  new.shipping_company_name := nullif(v_quote ->> 'company_name', '');
  new.shipping_snapshot := v_quote;
  new.details := (v_details
    || jsonb_build_object(
      'shipping_mode', case when coalesce((v_quote ->> 'matched')::boolean, false) then 'vendor_rate_snapshot' else 'unconfigured' end,
      'delivery_fee', v_fee,
      'delivery_fee_local', v_fee,
      'delivery_currency', v_currency,
      'shipping_company_name', new.shipping_company_name,
      'shipping_snapshot', v_quote,
      'grand_total_local', private.v94_numeric(v_details ->> 'customer_total_local', new.total_price) + v_fee
    ))::text;
  return new;
end;
$$;

drop trigger if exists trg_v98_apply_vendor_shipping on public.orders;
create trigger trg_v98_apply_vendor_shipping
before insert on public.orders
for each row execute function private.v98_apply_vendor_shipping();

create or replace function public.vendor_get_order_segment_shipping(
  p_session_token text,
  p_segment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_result jsonb;
begin
  select jsonb_build_object(
    'delivery_fee', coalesce(o.delivery_fee, 0),
    'delivery_currency', coalesce(o.delivery_currency, o.currency),
    'shipping_company_name', o.shipping_company_name,
    'shipping_snapshot', coalesce(o.shipping_snapshot, '{}'::jsonb),
    'goods_subtotal', s.subtotal_local,
    'grand_total', s.subtotal_local + coalesce(o.delivery_fee, 0)
  ) into v_result
  from public.order_store_segments s
  join public.orders o on o.id = s.order_id
  where s.id = p_segment_id
    and s.store_id = v_store_id
    and s.payment_confirmed = true;

  if v_result is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.vendor_get_shipping_settings(text) from public;
revoke all on function public.vendor_save_shipping_settings(text, bigint, boolean, text, jsonb, jsonb) from public;
revoke all on function public.vendor_get_order_segment_shipping(text, uuid) from public;
grant execute on function public.vendor_get_shipping_settings(text) to anon, authenticated;
grant execute on function public.vendor_save_shipping_settings(text, bigint, boolean, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.vendor_get_order_segment_shipping(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
