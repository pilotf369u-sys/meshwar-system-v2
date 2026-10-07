-- KINTO V130: account-scoped cloud cart persistence.
create table if not exists public.customer_local_carts (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint customer_local_carts_items_array check (jsonb_typeof(items) = 'array'),
  constraint customer_local_carts_items_size check (jsonb_array_length(items) <= 200)
);

alter table public.customer_local_carts enable row level security;
revoke all on public.customer_local_carts from anon, authenticated;

create or replace function public.customer_cart_get_v130(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  select jsonb_build_object('items', c.items, 'updated_at', c.updated_at)
    into v_result
  from public.customer_local_carts c
  where c.customer_id = p_customer_id;

  return coalesce(v_result, jsonb_build_object('items', '[]'::jsonb, 'updated_at', null));
end;
$$;

create or replace function public.customer_cart_put_v130(p_customer_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_at timestamptz;
begin
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_CART_ITEMS';
  end if;
  if jsonb_array_length(p_items) > 200 or pg_column_size(p_items) > 262144 then
    raise exception 'CART_TOO_LARGE';
  end if;

  insert into public.customer_local_carts(customer_id, items, updated_at)
  values (p_customer_id, p_items, now())
  on conflict (customer_id) do update
    set items = excluded.items,
        updated_at = excluded.updated_at
  returning updated_at into v_updated_at;

  return jsonb_build_object('items', p_items, 'updated_at', v_updated_at);
end;
$$;

revoke all on function public.customer_cart_get_v130(uuid) from public;
revoke all on function public.customer_cart_put_v130(uuid, jsonb) from public;
grant execute on function public.customer_cart_get_v130(uuid) to anon, authenticated;
grant execute on function public.customer_cart_put_v130(uuid, jsonb) to anon, authenticated;
