-- KINTO V93 live check-up hotfix.
-- 1) Bundle products remain immutable after submission without blocking operational updates.
-- 2) New local-cart bundle orders receive a canonical sequential numeric KN-XXXXXX code.

create sequence if not exists public.kinto_local_bundle_order_seq
  as bigint
  minvalue 1
  start with 1
  increment by 1
  cache 20;

-- Start after the largest existing numeric KN code when possible.
do $$
declare
  max_existing bigint;
begin
  select max((regexp_match(order_code, '^KN-([0-9]+)$'))[1]::bigint)
    into max_existing
    from public.orders
   where order_code ~ '^KN-[0-9]+$';
  if max_existing is not null then
    perform setval('public.kinto_local_bundle_order_seq', greatest(max_existing, 1), true);
  end if;
end $$;

create or replace function public.meshwar_assign_local_bundle_order_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  n bigint;
begin
  begin
    d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;
  if coalesce(d->>'source','') <> 'local_cart_bundle' then
    return new;
  end if;
  n := nextval('public.kinto_local_bundle_order_seq');
  new.order_code := 'KN-' || lpad(n::text, 6, '0');
  d := jsonb_set(d, '{bundle_id}', to_jsonb(new.order_code), true);
  new.details := d;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_assign_local_bundle_order_code on public.orders;
create trigger trg_meshwar_assign_local_bundle_order_code
before insert on public.orders
for each row
execute function public.meshwar_assign_local_bundle_order_code();

create or replace function public.meshwar_local_cart_bundle_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_d jsonb;
  new_d jsonb;
begin
  begin
    old_d := coalesce(old.details::jsonb, '{}'::jsonb);
    new_d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(old_d->>'source','') <> 'local_cart_bundle' then
    return new;
  end if;

  -- Never reject staff operational changes. Instead, restore only the submitted
  -- product payload and identity fields from OLD. Status, shipping, payment,
  -- branch, parcel and all other operational columns/metadata remain editable.
  new_d := jsonb_set(new_d, '{source}', old_d->'source', true);
  new_d := jsonb_set(new_d, '{items}', coalesce(old_d->'items','[]'::jsonb), true);
  if old_d ? 'quantity' then new_d := jsonb_set(new_d, '{quantity}', old_d->'quantity', true); end if;
  if old_d ? 'requested_quantity' then new_d := jsonb_set(new_d, '{requested_quantity}', old_d->'requested_quantity', true); end if;
  if old_d ? 'item_count' then new_d := jsonb_set(new_d, '{item_count}', old_d->'item_count', true); end if;
  if old_d ? 'bundle_id' then new_d := jsonb_set(new_d, '{bundle_id}', old_d->'bundle_id', true); end if;
  if old_d ? 'bundle_version' then new_d := jsonb_set(new_d, '{bundle_version}', old_d->'bundle_version', true); end if;
  if old_d ? 'store_id' then new_d := jsonb_set(new_d, '{store_id}', old_d->'store_id', true); end if;
  if old_d ? 'customer_scope_id' then new_d := jsonb_set(new_d, '{customer_scope_id}', old_d->'customer_scope_id', true); end if;
  if old_d ? 'customer_scope_type' then new_d := jsonb_set(new_d, '{customer_scope_type}', old_d->'customer_scope_type', true); end if;
  if old_d ? 'submitted_at' then new_d := jsonb_set(new_d, '{submitted_at}', old_d->'submitted_at', true); end if;

  new.details := new_d;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_guard on public.orders;
create trigger trg_meshwar_local_cart_bundle_guard
before update of details on public.orders
for each row
execute function public.meshwar_local_cart_bundle_guard();
