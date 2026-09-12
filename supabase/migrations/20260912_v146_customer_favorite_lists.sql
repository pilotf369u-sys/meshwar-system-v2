-- KINTO V146: additive-only customer favorite lists.
-- No existing table, order, cart, review, employee, tracking, or invoice is altered.

begin;

create table if not exists public.customer_favorite_lists (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on update cascade on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_favorite_lists_name_length check (char_length(trim(name)) between 1 and 80),
  constraint customer_favorite_lists_identity unique (id, customer_id)
);

create unique index if not exists uq_customer_favorite_lists_name
  on public.customer_favorite_lists(customer_id, lower(trim(name)));
create unique index if not exists uq_customer_favorite_lists_one_default
  on public.customer_favorite_lists(customer_id)
  where is_default;
create index if not exists idx_customer_favorite_lists_customer
  on public.customer_favorite_lists(customer_id, is_default desc, created_at asc);

create table if not exists public.customer_favorite_items (
  id uuid primary key default extensions.gen_random_uuid(),
  list_id uuid not null,
  customer_id uuid not null,
  store_id uuid not null references public.local_stores(id) on update cascade on delete cascade,
  product_id uuid not null references public.local_products(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  constraint customer_favorite_items_owner
    foreign key (list_id, customer_id)
    references public.customer_favorite_lists(id, customer_id)
    on update cascade on delete cascade,
  constraint customer_favorite_items_unique unique (list_id, product_id)
);

create index if not exists idx_customer_favorite_items_customer
  on public.customer_favorite_items(customer_id, created_at desc);
create index if not exists idx_customer_favorite_items_product
  on public.customer_favorite_items(product_id, customer_id);

alter table public.customer_favorite_lists enable row level security;
alter table public.customer_favorite_items enable row level security;
revoke all on public.customer_favorite_lists from public, anon, authenticated;
revoke all on public.customer_favorite_items from public, anon, authenticated;

create or replace function private.favorite_customer_v146(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
begin
  return private.require_customer_review_session(p_session_token);
end;
$$;

revoke all on function private.favorite_customer_v146(text) from public, anon, authenticated;

create or replace function private.favorite_default_list_v146(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_list_id uuid;
begin
  select l.id into v_list_id
  from public.customer_favorite_lists l
  where l.customer_id = p_customer_id and l.is_default
  limit 1;

  if v_list_id is null then
    insert into public.customer_favorite_lists(customer_id, name, is_default)
    values (p_customer_id, 'عام', true)
    on conflict (customer_id) where is_default do nothing
    returning id into v_list_id;

    if v_list_id is null then
      select l.id into v_list_id
      from public.customer_favorite_lists l
      where l.customer_id = p_customer_id and l.is_default
      limit 1;
    end if;
  end if;

  return v_list_id;
end;
$$;

revoke all on function private.favorite_default_list_v146(uuid) from public, anon, authenticated;

create or replace function public.customer_favorites_get_v146(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_default_id uuid;
  v_result jsonb;
begin
  v_customer_id := private.favorite_customer_v146(p_session_token);
  v_default_id := private.favorite_default_list_v146(v_customer_id);

  select jsonb_build_object(
    'ok', true,
    'default_list_id', v_default_id,
    'total_items', (select count(*) from public.customer_favorite_items i where i.customer_id = v_customer_id),
    'lists', coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'is_default', l.is_default,
      'item_count', (select count(*) from public.customer_favorite_items c where c.list_id = l.id),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'product_id', i.product_id,
          'store_id', i.store_id,
          'product_name', p.product_name,
          'description', p.description,
          'image_url', p.image_url,
          'base_price', p.base_price,
          'discount_price', p.discount_price,
          'is_out_of_stock', p.is_out_of_stock,
          'store_name', s.store_name,
          'saved_at', i.created_at
        ) order by i.created_at desc)
        from public.customer_favorite_items i
        join public.local_products p on p.id = i.product_id
        join public.local_stores s on s.id = i.store_id
        where i.list_id = l.id
      ), '[]'::jsonb)
    ) order by l.is_default desc, l.created_at asc), '[]'::jsonb)
  ) into v_result
  from public.customer_favorite_lists l
  where l.customer_id = v_customer_id;

  return v_result;
end;
$$;

create or replace function public.customer_favorite_list_create_v146(
  p_session_token text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_list public.customer_favorite_lists%rowtype;
begin
  v_customer_id := private.favorite_customer_v146(p_session_token);
  perform private.favorite_default_list_v146(v_customer_id);
  if char_length(v_name) not between 1 and 80 then raise exception 'FAVORITE_LIST_NAME_INVALID'; end if;
  if (select count(*) from public.customer_favorite_lists where customer_id = v_customer_id) >= 20 then raise exception 'FAVORITE_LIST_LIMIT'; end if;

  insert into public.customer_favorite_lists(customer_id, name)
  values (v_customer_id, v_name)
  returning * into v_list;
  return jsonb_build_object('ok', true, 'list', to_jsonb(v_list));
exception when unique_violation then
  raise exception 'FAVORITE_LIST_NAME_EXISTS';
end;
$$;

create or replace function public.customer_favorite_list_rename_v146(
  p_session_token text,
  p_list_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  v_customer_id := private.favorite_customer_v146(p_session_token);
  if char_length(v_name) not between 1 and 80 then raise exception 'FAVORITE_LIST_NAME_INVALID'; end if;
  update public.customer_favorite_lists
  set name = v_name, updated_at = now()
  where id = p_list_id and customer_id = v_customer_id and not is_default;
  if not found then raise exception 'FAVORITE_LIST_NOT_FOUND_OR_DEFAULT'; end if;
  return jsonb_build_object('ok', true, 'list_id', p_list_id, 'name', v_name);
exception when unique_violation then
  raise exception 'FAVORITE_LIST_NAME_EXISTS';
end;
$$;

create or replace function public.customer_favorite_list_delete_v146(
  p_session_token text,
  p_list_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := private.favorite_customer_v146(p_session_token);
  delete from public.customer_favorite_lists
  where id = p_list_id and customer_id = v_customer_id and not is_default;
  if not found then raise exception 'FAVORITE_LIST_NOT_FOUND_OR_DEFAULT'; end if;
  return jsonb_build_object('ok', true, 'deleted_list_id', p_list_id);
end;
$$;

create or replace function public.customer_favorite_toggle_v146(
  p_session_token text,
  p_product_id uuid,
  p_list_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_list_id uuid;
  v_store_id uuid;
begin
  v_customer_id := private.favorite_customer_v146(p_session_token);
  v_list_id := coalesce(p_list_id, private.favorite_default_list_v146(v_customer_id));
  if not exists (select 1 from public.customer_favorite_lists where id = v_list_id and customer_id = v_customer_id) then raise exception 'FAVORITE_LIST_NOT_FOUND'; end if;

  if exists (select 1 from public.customer_favorite_items where list_id = v_list_id and product_id = p_product_id) then
    delete from public.customer_favorite_items where list_id = v_list_id and customer_id = v_customer_id and product_id = p_product_id;
    return jsonb_build_object('ok', true, 'favorite', false, 'list_id', v_list_id, 'product_id', p_product_id);
  end if;

  if (select count(*) from public.customer_favorite_items where customer_id = v_customer_id) >= 500 then raise exception 'FAVORITE_ITEM_LIMIT'; end if;
  select p.store_id into v_store_id from public.local_products p where p.id = p_product_id limit 1;
  if v_store_id is null then raise exception 'FAVORITE_PRODUCT_NOT_FOUND'; end if;
  insert into public.customer_favorite_items(list_id, customer_id, store_id, product_id)
  values (v_list_id, v_customer_id, v_store_id, p_product_id);
  return jsonb_build_object('ok', true, 'favorite', true, 'list_id', v_list_id, 'product_id', p_product_id);
end;
$$;

create or replace function public.customer_favorite_move_v146(
  p_session_token text,
  p_product_id uuid,
  p_from_list_id uuid,
  p_to_list_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_store_id uuid;
begin
  v_customer_id := private.favorite_customer_v146(p_session_token);
  if p_from_list_id = p_to_list_id then return jsonb_build_object('ok', true, 'moved', false); end if;
  if not exists (select 1 from public.customer_favorite_lists where id = p_to_list_id and customer_id = v_customer_id) then raise exception 'FAVORITE_TARGET_LIST_NOT_FOUND'; end if;
  select store_id into v_store_id from public.customer_favorite_items where list_id = p_from_list_id and customer_id = v_customer_id and product_id = p_product_id;
  if v_store_id is null then raise exception 'FAVORITE_ITEM_NOT_FOUND'; end if;
  insert into public.customer_favorite_items(list_id, customer_id, store_id, product_id)
  values (p_to_list_id, v_customer_id, v_store_id, p_product_id)
  on conflict (list_id, product_id) do nothing;
  delete from public.customer_favorite_items where list_id = p_from_list_id and customer_id = v_customer_id and product_id = p_product_id;
  return jsonb_build_object('ok', true, 'moved', true, 'product_id', p_product_id, 'from_list_id', p_from_list_id, 'to_list_id', p_to_list_id);
end;
$$;

revoke all on function public.customer_favorites_get_v146(text) from public;
revoke all on function public.customer_favorite_list_create_v146(text, text) from public;
revoke all on function public.customer_favorite_list_rename_v146(text, uuid, text) from public;
revoke all on function public.customer_favorite_list_delete_v146(text, uuid) from public;
revoke all on function public.customer_favorite_toggle_v146(text, uuid, uuid) from public;
revoke all on function public.customer_favorite_move_v146(text, uuid, uuid, uuid) from public;
grant execute on function public.customer_favorites_get_v146(text) to anon, authenticated;
grant execute on function public.customer_favorite_list_create_v146(text, text) to anon, authenticated;
grant execute on function public.customer_favorite_list_rename_v146(text, uuid, text) to anon, authenticated;
grant execute on function public.customer_favorite_list_delete_v146(text, uuid) to anon, authenticated;
grant execute on function public.customer_favorite_toggle_v146(text, uuid, uuid) to anon, authenticated;
grant execute on function public.customer_favorite_move_v146(text, uuid, uuid, uuid) to anon, authenticated;

commit;
