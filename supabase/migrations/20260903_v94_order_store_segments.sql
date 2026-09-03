-- V94 store segmentation contract
-- Adds server-owned, per-store order projections without replacing public.orders.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.order_store_segments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  store_id uuid not null references public.local_stores(id) on delete restrict,
  store_name_snapshot text not null,
  items_snapshot jsonb not null default '[]'::jsonb,
  quantity_total integer not null,
  subtotal_local numeric(18,2) not null,
  currency text not null,
  store_status text not null default 'بانتظار التسديد',
  payment_confirmed boolean not null default false,
  confirmed_at timestamptz,
  customer_snapshot jsonb not null default '{}'::jsonb,
  commission_snapshot jsonb not null default '{}'::jsonb,
  vendor_payment_status text not null default 'pending',
  invoice_version text not null default 'v94-store-invoice-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_store_segments_order_store_unique unique(order_id, store_id),
  constraint order_store_segments_quantity_positive check(quantity_total > 0),
  constraint order_store_segments_subtotal_nonnegative check(subtotal_local >= 0),
  constraint order_store_segments_items_array check(jsonb_typeof(items_snapshot) = 'array'),
  constraint order_store_segments_customer_object check(jsonb_typeof(customer_snapshot) = 'object')
);

create index if not exists idx_order_store_segments_store_created
  on public.order_store_segments(store_id, created_at desc);
create index if not exists idx_order_store_segments_store_status
  on public.order_store_segments(store_id, store_status, created_at desc);
create index if not exists idx_order_store_segments_confirmed
  on public.order_store_segments(store_id, confirmed_at desc)
  where payment_confirmed = true;

alter table public.order_store_segments enable row level security;
revoke all on public.order_store_segments from public, anon, authenticated;

create table if not exists public.vendor_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.local_stores(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_sessions_store_active
  on public.vendor_sessions(store_id, expires_at desc)
  where revoked_at is null;

alter table public.vendor_sessions enable row level security;
revoke all on public.vendor_sessions from public, anon, authenticated;

create or replace function private.v94_jsonb_object(p_value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_result jsonb;
begin
  if p_value is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p_value) = 'object' then return p_value; end if;
  if jsonb_typeof(p_value) = 'string' then
    begin
      v_result := (p_value #>> '{}')::jsonb;
      if jsonb_typeof(v_result) = 'object' then return v_result; end if;
    exception when others then
      return '{}'::jsonb;
    end;
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function private.v94_numeric(p_value text, p_default numeric default 0)
returns numeric
language plpgsql
immutable
as $$
begin
  return coalesce(nullif(trim(p_value), '')::numeric, p_default);
exception when others then
  return p_default;
end;
$$;

create or replace function private.v94_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return nullif(trim(p_value), '')::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.v94_sync_order_segments(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order jsonb;
  v_details jsonb;
  v_customer_row jsonb := '{}'::jsonb;
  v_customer jsonb;
  v_paid boolean;
begin
  select to_jsonb(o) into v_order
  from public.orders o
  where o.id = p_order_id;

  if v_order is null then return; end if;
  v_details := private.v94_jsonb_object(v_order -> 'details');
  if coalesce(v_details ->> 'source', '') <> 'local_cart_bundle' then return; end if;

  if coalesce(v_order ->> 'customer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select coalesce(to_jsonb(c), '{}'::jsonb) into v_customer_row
    from public.customers c
    where c.id = (v_order ->> 'customer_id')::uuid
    limit 1;
    v_customer_row := coalesce(v_customer_row, '{}'::jsonb);
  end if;

  v_paid := coalesce(v_details ->> 'bundle_stock_lifecycle_state', '') = 'deducted'
    or coalesce(v_order ->> 'status', '') in ('تم التسديد', 'paid', 'Paid');

  v_customer := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(coalesce(v_order ->> 'customer_name', v_details ->> 'customer_name', v_details #>> '{customer,name}', v_customer_row ->> 'name'), ''),
    'code', nullif(coalesce(v_order ->> 'customer_code', v_details ->> 'customer_code', v_details #>> '{customer,customer_code}', v_details #>> '{customer,code}', v_customer_row ->> 'customer_code', v_customer_row ->> 'code'), ''),
    'phone', nullif(coalesce(v_order ->> 'customer_phone', v_details ->> 'customer_phone', v_details #>> '{customer,phone}', v_customer_row ->> 'phone'), ''),
    'secondary_phone', nullif(coalesce(v_order ->> 'secondary_phone', v_details ->> 'secondary_phone', v_details ->> 'customer_secondary_phone', v_details #>> '{customer,secondary_phone}', v_customer_row ->> 'secondary_phone', v_customer_row ->> 'phone2', v_customer_row ->> 'alt_phone'), ''),
    'country', nullif(coalesce(v_order ->> 'country', v_details ->> 'country', v_details ->> 'customer_country', v_details #>> '{customer,country}', v_customer_row ->> 'country', v_customer_row ->> 'country_name'), ''),
    'province', nullif(coalesce(v_order ->> 'governorate', v_order ->> 'province', v_order ->> 'city', v_details ->> 'governorate', v_details ->> 'province', v_details ->> 'city', v_details #>> '{customer,governorate}', v_details #>> '{customer,province}', v_details #>> '{customer,city}', v_customer_row ->> 'governorate', v_customer_row ->> 'province', v_customer_row ->> 'state', v_customer_row ->> 'city'), ''),
    'address', nullif(coalesce(v_order ->> 'address', v_order ->> 'address_details', v_order ->> 'delivery_address', v_details ->> 'address', v_details ->> 'address_details', v_details ->> 'delivery_address', v_details ->> 'customer_address', v_details #>> '{customer,address}', v_details #>> '{customer,address_details}', v_customer_row ->> 'address', v_customer_row ->> 'address_details', v_customer_row ->> 'full_address', v_customer_row ->> 'delivery_address'), '')
  ));

  insert into public.order_store_segments (
    order_id, store_id, store_name_snapshot, items_snapshot, quantity_total,
    subtotal_local, currency, store_status, payment_confirmed, confirmed_at,
    customer_snapshot, commission_snapshot, vendor_payment_status
  )
  select
    p_order_id,
    ls.id,
    coalesce(nullif(max(x.item ->> 'store_name'), ''), 'المتجر'),
    jsonb_agg(x.item order by x.ordinality),
    sum(greatest(1, private.v94_numeric(x.item ->> 'quantity', 1)::integer)),
    sum(coalesce(
      private.v94_numeric(x.item ->> 'line_total_local', null),
      private.v94_numeric(x.item ->> 'unit_price_local', 0) * greatest(1, private.v94_numeric(x.item ->> 'quantity', 1))
    )),
    coalesce(nullif(max(x.item ->> 'currency'), ''), nullif(v_details ->> 'local_currency', ''), nullif(v_order ->> 'currency', ''), 'IQD'),
    coalesce(nullif(v_details -> 'store_statuses' ->> (x.item ->> 'store_id'), ''), 'بانتظار التسديد'),
    v_paid,
    case when v_paid then now() else null end,
    v_customer,
    jsonb_build_object('commission_rate', max(private.v94_numeric(x.item #>> '{pricing_snapshot,commission_rate}', 0))),
    coalesce(nullif(v_details ->> 'vendor_payment_status', ''), nullif(v_details ->> 'vendor_settlement_status', ''), 'pending')
  from jsonb_array_elements(coalesce(v_details -> 'items', '[]'::jsonb)) with ordinality as x(item, ordinality)
  join public.local_stores ls on ls.id = private.v94_uuid(x.item ->> 'store_id')
  group by ls.id, x.item ->> 'store_id'
  on conflict (order_id, store_id) do update set
    store_name_snapshot = case when order_store_segments.payment_confirmed then order_store_segments.store_name_snapshot else excluded.store_name_snapshot end,
    items_snapshot = case when order_store_segments.payment_confirmed then order_store_segments.items_snapshot else excluded.items_snapshot end,
    quantity_total = case when order_store_segments.payment_confirmed then order_store_segments.quantity_total else excluded.quantity_total end,
    subtotal_local = case when order_store_segments.payment_confirmed then order_store_segments.subtotal_local else excluded.subtotal_local end,
    currency = case when order_store_segments.payment_confirmed then order_store_segments.currency else excluded.currency end,
    payment_confirmed = order_store_segments.payment_confirmed or excluded.payment_confirmed,
    confirmed_at = case
      when order_store_segments.confirmed_at is not null then order_store_segments.confirmed_at
      when excluded.payment_confirmed then now()
      else null
    end,
    customer_snapshot = case when order_store_segments.payment_confirmed then order_store_segments.customer_snapshot else excluded.customer_snapshot end,
    commission_snapshot = case when order_store_segments.payment_confirmed then order_store_segments.commission_snapshot else excluded.commission_snapshot end,
    updated_at = now();
end;
$$;

create or replace function private.v94_orders_segment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.v94_sync_order_segments(new.id);
  return new;
end;
$$;

drop trigger if exists trg_v94_sync_order_store_segments on public.orders;
drop trigger if exists trg_v94_sync_order_store_segments_insert on public.orders;
drop trigger if exists trg_v94_sync_order_store_segments_update on public.orders;
create trigger trg_v94_sync_order_store_segments_insert
after insert on public.orders
for each row execute procedure private.v94_orders_segment_trigger();
create trigger trg_v94_sync_order_store_segments_update
after update of details, status, reference_order_no on public.orders
for each row execute procedure private.v94_orders_segment_trigger();

create or replace function private.require_vendor_session(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid;
begin
  if coalesce(length(p_session_token), 0) < 32 then
    raise exception 'VENDOR_SESSION_INVALID' using errcode = '28000';
  end if;

  select s.store_id into v_store_id
  from public.vendor_sessions s
  join public.local_stores ls on ls.id = s.store_id
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
    and lower(trim(coalesce(ls.status, ''))) = 'active'
  limit 1;

  if v_store_id is null then
    raise exception 'VENDOR_SESSION_INVALID' using errcode = '28000';
  end if;

  update public.vendor_sessions
  set last_seen_at = now()
  where token_hash = digest(p_session_token, 'sha256');
  return v_store_id;
end;
$$;

create or replace function public.vendor_login_session(
  p_identity text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store public.local_stores%rowtype;
  v_password_hash text;
  v_ok boolean := false;
  v_token text;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if trim(coalesce(p_identity, '')) = '' or coalesce(p_password, '') = '' then
    raise exception 'بيانات الدخول غير مكتملة' using errcode = '28000';
  end if;

  select s.* into v_store
  from public.local_stores s
  where lower(trim(coalesce(s.username, ''))) = lower(trim(p_identity))
     or trim(coalesce(s.phone, '')) = trim(p_identity)
  order by s.created_at asc
  limit 1;

  if v_store.id is null or lower(trim(coalesce(v_store.status, ''))) <> 'active' then
    raise exception 'بيانات الدخول غير صحيحة أو المتجر غير نشط' using errcode = '28000';
  end if;

  v_password_hash := coalesce(v_store.password_hash, '');
  v_ok := v_password_hash <> '' and v_password_hash = p_password;
  if not v_ok and v_password_hash <> '' then
    begin
      v_ok := crypt(p_password, v_password_hash) = v_password_hash;
    exception when others then
      v_ok := false;
    end;
  end if;
  if not v_ok then
    raise exception 'بيانات الدخول غير صحيحة أو المتجر غير نشط' using errcode = '28000';
  end if;

  delete from public.vendor_sessions where expires_at <= now() or revoked_at is not null;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.vendor_sessions(store_id, token_hash, expires_at)
  values(v_store.id, digest(v_token, 'sha256'), v_expires_at);

  return jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expires_at,
    'store', jsonb_build_object(
      'id', v_store.id,
      'store_name', v_store.store_name,
      'logo_url', v_store.logo_url,
      'username', v_store.username,
      'phone', v_store.phone,
      'country', v_store.country,
      'governorate', v_store.governorate,
      'store_type', v_store.store_type,
      'specialty', v_store.specialty,
      'default_currency', v_store.default_currency,
      'commission_rate', v_store.commission_rate,
      'status', v_store.status,
      'exchange_rate', v_store.exchange_rate,
      'exchange_base_currency', v_store.exchange_base_currency,
      'exchange_target_currency', v_store.exchange_target_currency
    )
  );
end;
$$;

create or replace function public.vendor_logout_session(p_session_token text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.vendor_sessions
  set revoked_at = coalesce(revoked_at, now())
  where token_hash = digest(coalesce(p_session_token, ''), 'sha256');
end;
$$;

create or replace function public.vendor_list_order_segments(
  p_session_token text,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  segment_id uuid,
  order_id uuid,
  order_code text,
  reference_order_no text,
  order_created_at timestamptz,
  items_preview jsonb,
  quantity_total integer,
  subtotal_local numeric,
  currency text,
  store_status text,
  confirmed_at timestamptz,
  vendor_payment_status text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
begin
  return query
  select
    s.id,
    s.order_id,
    coalesce(o.order_code::text, o.id::text),
    o.reference_order_no::text,
    o.created_at,
    s.items_snapshot,
    s.quantity_total,
    s.subtotal_local,
    s.currency,
    s.store_status,
    s.confirmed_at,
    s.vendor_payment_status
  from public.order_store_segments s
  join public.orders o on o.id = s.order_id
  where s.store_id = v_store_id
    and s.payment_confirmed = true
  order by s.confirmed_at desc nulls last, s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.vendor_get_order_segment_details(
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
    'segment_id', s.id,
    'order_id', s.order_id,
    'order_code', coalesce(o.order_code::text, o.id::text),
    'reference_order_no', o.reference_order_no,
    'order_created_at', o.created_at,
    'store_id', s.store_id,
    'store_name', s.store_name_snapshot,
    'items', s.items_snapshot,
    'quantity_total', s.quantity_total,
    'subtotal_local', s.subtotal_local,
    'currency', s.currency,
    'store_status', s.store_status,
    'confirmed_at', s.confirmed_at,
    'customer', s.customer_snapshot,
    'commission', s.commission_snapshot,
    'vendor_payment_status', s.vendor_payment_status,
    'invoice_version', s.invoice_version
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

create or replace function private.mirror_v94_store_status(
  p_order_id uuid,
  p_store_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_type text;
begin
  select c.udt_name into v_type
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'details';

  if v_type = 'jsonb' then
    execute 'update public.orders set details = jsonb_set(private.v94_jsonb_object(to_jsonb(details)), array[''store_statuses'', $2], to_jsonb($3::text), true) where id = $1'
      using p_order_id, p_store_id::text, p_status;
  elsif v_type = 'json' then
    execute 'update public.orders set details = jsonb_set(private.v94_jsonb_object(to_jsonb(details)), array[''store_statuses'', $2], to_jsonb($3::text), true)::json where id = $1'
      using p_order_id, p_store_id::text, p_status;
  else
    execute 'update public.orders set details = jsonb_set(private.v94_jsonb_object(to_jsonb(details)), array[''store_statuses'', $2], to_jsonb($3::text), true)::text where id = $1'
      using p_order_id, p_store_id::text, p_status;
  end if;
end;
$$;

create or replace function public.vendor_advance_order_segment_status(
  p_session_token text,
  p_segment_id uuid,
  p_expected_status text,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_segment public.order_store_segments%rowtype;
  v_allowed_next text;
begin
  select * into v_segment
  from public.order_store_segments s
  where s.id = p_segment_id and s.store_id = v_store_id
  for update;

  if v_segment.id is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_segment.payment_confirmed then
    raise exception 'ORDER_NOT_PAID' using errcode = 'P0001';
  end if;
  if v_segment.store_status <> p_expected_status then
    raise exception 'ORDER_STATUS_CONFLICT:%', v_segment.store_status using errcode = '40001';
  end if;

  v_allowed_next := case v_segment.store_status
    when 'بانتظار التسديد' then 'قيد التجهيز'
    when 'قيد التجهيز' then 'جاهز للتسليم للمندوب'
    when 'جاهز للتسليم للمندوب' then 'تم التسليم للمندوب'
    else null
  end;
  if v_allowed_next is null or p_next_status <> v_allowed_next then
    raise exception 'ORDER_STATUS_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.order_store_segments
  set store_status = p_next_status, updated_at = now()
  where id = v_segment.id;

  perform private.mirror_v94_store_status(v_segment.order_id, v_store_id, p_next_status);
  return jsonb_build_object(
    'segment_id', v_segment.id,
    'order_id', v_segment.order_id,
    'store_status', p_next_status,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.vendor_login_session(text, text) from public;
revoke all on function public.vendor_logout_session(text) from public;
revoke all on function public.vendor_list_order_segments(text, integer, integer) from public;
revoke all on function public.vendor_get_order_segment_details(text, uuid) from public;
revoke all on function public.vendor_advance_order_segment_status(text, uuid, text, text) from public;
grant execute on function public.vendor_login_session(text, text) to anon, authenticated;
grant execute on function public.vendor_logout_session(text) to anon, authenticated;
grant execute on function public.vendor_list_order_segments(text, integer, integer) to anon, authenticated;
grant execute on function public.vendor_get_order_segment_details(text, uuid) to anon, authenticated;
grant execute on function public.vendor_advance_order_segment_status(text, uuid, text, text) to anon, authenticated;

do $$
declare
  v_order record;
begin
  for v_order in
    select o.id
    from public.orders o
    where private.v94_jsonb_object(to_jsonb(o) -> 'details') ->> 'source' = 'local_cart_bundle'
  loop
    perform private.v94_sync_order_segments(v_order.id);
  end loop;
end;
$$;

commit;
