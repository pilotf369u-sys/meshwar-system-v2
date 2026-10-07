-- Local-store order compatibility + paid-stock deduction.
-- No table/column changes. Trigger logic only.
--
-- Current storefront code performs a short-lived stock reservation before INSERT.
-- This migration releases that reservation after a successful order INSERT,
-- then performs the final stock deduction exactly once when status becomes "تم التسديد".
-- It also normalizes legacy selected_* option keys to color/size/volume.

create or replace function public.meshwar_normalize_local_order_details()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  d jsonb;
begin
  begin
    d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(d->>'source','') <> 'local_store' then
    return new;
  end if;

  if coalesce(d->>'color','') = '' and coalesce(d->>'selected_color','') <> '' then
    d := jsonb_set(d, '{color}', to_jsonb(d->>'selected_color'), true);
  end if;
  if coalesce(d->>'size','') = '' and coalesce(d->>'selected_size','') <> '' then
    d := jsonb_set(d, '{size}', to_jsonb(d->>'selected_size'), true);
  end if;
  if coalesce(d->>'volume','') = '' and coalesce(d->>'selected_volume','') <> '' then
    d := jsonb_set(d, '{volume}', to_jsonb(d->>'selected_volume'), true);
  end if;

  -- Preserve both naming conventions for backward/forward UI compatibility.
  if coalesce(d->>'selected_color','') = '' and coalesce(d->>'color','') <> '' then
    d := jsonb_set(d, '{selected_color}', to_jsonb(d->>'color'), true);
  end if;
  if coalesce(d->>'selected_size','') = '' and coalesce(d->>'size','') <> '' then
    d := jsonb_set(d, '{selected_size}', to_jsonb(d->>'size'), true);
  end if;
  if coalesce(d->>'selected_volume','') = '' and coalesce(d->>'volume','') <> '' then
    d := jsonb_set(d, '{selected_volume}', to_jsonb(d->>'volume'), true);
  end if;

  new.details := d;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_normalize_local_order_details on public.orders;
create trigger trg_meshwar_normalize_local_order_details
before insert or update of details on public.orders
for each row
execute function public.meshwar_normalize_local_order_details();

create or replace function public.meshwar_release_local_stock_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  product_uuid uuid;
  requested_qty integer;
begin
  begin
    d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(d->>'source','') <> 'local_store' then
    return new;
  end if;

  begin
    product_uuid := nullif(d->>'product_id','')::uuid;
    requested_qty := greatest(1, coalesce(nullif(d->>'requested_quantity','')::integer, nullif(d->>'quantity','')::integer, 1));
  exception when others then
    return new;
  end;

  -- The current storefront already reserved requested_qty immediately before INSERT.
  -- Release that temporary reservation after the order is committed successfully.
  update public.local_products
     set stock_quantity = stock_quantity + requested_qty,
         is_out_of_stock = false
   where id = product_uuid
     and stock_quantity is not null;

  return new;
end;
$$;

drop trigger if exists trg_meshwar_release_local_stock_after_insert on public.orders;
create trigger trg_meshwar_release_local_stock_after_insert
after insert on public.orders
for each row
execute function public.meshwar_release_local_stock_after_insert();

create or replace function public.meshwar_deduct_local_stock_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  product_uuid uuid;
  requested_qty integer;
  current_stock integer;
begin
  if new.status is distinct from 'تم التسديد' or old.status = 'تم التسديد' then
    return new;
  end if;

  begin
    d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(d->>'source','') <> 'local_store' then
    return new;
  end if;
  if coalesce(d->>'stock_deducted_at','') <> '' then
    return new;
  end if;

  begin
    product_uuid := nullif(d->>'product_id','')::uuid;
    requested_qty := greatest(1, coalesce(nullif(d->>'requested_quantity','')::integer, nullif(d->>'quantity','')::integer, 1));
  exception when others then
    return new;
  end;

  select stock_quantity into current_stock
    from public.local_products
   where id = product_uuid
   for update;

  if not found then
    raise exception 'Local product % was not found', product_uuid;
  end if;

  -- Legacy products with unmanaged/null stock stay compatible.
  if current_stock is null then
    return new;
  end if;

  if current_stock < requested_qty then
    raise exception 'Insufficient stock for product %. Available %, requested %', product_uuid, current_stock, requested_qty;
  end if;

  update public.local_products
     set stock_quantity = current_stock - requested_qty,
         is_out_of_stock = (current_stock - requested_qty) = 0
   where id = product_uuid;

  d := jsonb_set(d, '{stock_deducted_at}', to_jsonb(now()::text), true);
  d := jsonb_set(d, '{stock_deducted_quantity}', to_jsonb(requested_qty), true);
  new.details := d;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_deduct_local_stock_on_paid on public.orders;
create trigger trg_meshwar_deduct_local_stock_on_paid
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_deduct_local_stock_on_paid();
