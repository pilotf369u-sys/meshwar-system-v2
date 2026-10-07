-- MeshWar local-store stock lifecycle (standalone / idempotent)
-- Safe to run directly in Supabase SQL Editor even if the previous local-store
-- migration was not applied yet.
--
-- Behavior:
--   1) Normalize local-store order option keys to color / size / volume.
--   2) Release the storefront's temporary pre-insert stock reservation after INSERT,
--      so order creation does not leave a final stock deduction.
--   3) Deduct requested quantity exactly once when status becomes "تم التسديد".
--   4) Restore the same quantity when a previously-paid order becomes rejected/cancelled.
--   5) Support a later paid -> cancelled -> paid cycle without double deduction/restoration.
--
-- No table/column changes. Trigger/function logic only.

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

  -- Keep legacy keys for old UIs that still read selected_*.
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
    requested_qty := greatest(
      1,
      coalesce(
        nullif(d->>'requested_quantity','')::integer,
        nullif(d->>'quantity','')::integer,
        1
      )
    );
  exception when others then
    return new;
  end;

  -- Current storefront performs a temporary Compare-and-Set reservation before INSERT.
  -- Release it immediately after a successful order INSERT. This means the order itself
  -- does not retain a stock deduction; the final deduction occurs only on paid status.
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


create or replace function public.meshwar_local_stock_status_lifecycle()
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
  lifecycle_state text;
  rejected_or_cancelled boolean;
begin
  if old.status is not distinct from new.status then
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

  begin
    product_uuid := nullif(d->>'product_id','')::uuid;
    requested_qty := greatest(
      1,
      coalesce(
        nullif(d->>'requested_quantity','')::integer,
        nullif(d->>'quantity','')::integer,
        1
      )
    );
  exception when others then
    return new;
  end;

  lifecycle_state := coalesce(d->>'stock_lifecycle_state','');
  rejected_or_cancelled := new.status = any(array[
    'مرفوض',
    'رفض التسليم',
    'رفض الطلب',
    'ملغي من قبل العميل',
    'ملغي',
    'ملغى'
  ]);

  -- PAID: deduct exactly once for the current lifecycle state.
  if new.status = 'تم التسديد' then
    -- Backward compatibility: an older migration may have stock_deducted_at but no
    -- explicit lifecycle state. Treat it as already deducted unless it was restored.
    if lifecycle_state = 'deducted' then
      return new;
    end if;
    if lifecycle_state = ''
       and coalesce(d->>'stock_deducted_at','') <> ''
       and coalesce(d->>'stock_restored_at','') = '' then
      d := jsonb_set(d, '{stock_lifecycle_state}', '"deducted"'::jsonb, true);
      new.details := d;
      return new;
    end if;

    select stock_quantity
      into current_stock
      from public.local_products
     where id = product_uuid
     for update;

    if not found then
      raise exception 'Local product % was not found', product_uuid;
    end if;

    -- Legacy products with null/unmanaged stock remain compatible.
    if current_stock is null then
      return new;
    end if;

    if current_stock < requested_qty then
      raise exception 'Insufficient stock for product %. Available %, requested %',
        product_uuid, current_stock, requested_qty;
    end if;

    update public.local_products
       set stock_quantity = current_stock - requested_qty,
           is_out_of_stock = (current_stock - requested_qty) = 0
     where id = product_uuid;

    d := jsonb_set(d, '{stock_lifecycle_state}', '"deducted"'::jsonb, true);
    d := jsonb_set(d, '{stock_deducted_at}', to_jsonb(now()::text), true);
    d := jsonb_set(d, '{stock_deducted_quantity}', to_jsonb(requested_qty), true);
    -- A new paid cycle supersedes an earlier restoration marker.
    d := d - 'stock_restored_at' - 'stock_restored_quantity';
    new.details := d;
    return new;
  end if;

  -- REJECTED / CANCELLED: restore only if stock is currently deducted.
  if rejected_or_cancelled then
    -- Legacy compatibility: stock_deducted_at without stock_restored_at means deducted.
    if lifecycle_state <> 'deducted' then
      if not (
        lifecycle_state = ''
        and coalesce(d->>'stock_deducted_at','') <> ''
        and coalesce(d->>'stock_restored_at','') = ''
      ) then
        return new;
      end if;
    end if;

    select stock_quantity
      into current_stock
      from public.local_products
     where id = product_uuid
     for update;

    if not found then
      raise exception 'Local product % was not found', product_uuid;
    end if;

    if current_stock is null then
      return new;
    end if;

    update public.local_products
       set stock_quantity = current_stock + requested_qty,
           is_out_of_stock = false
     where id = product_uuid;

    d := jsonb_set(d, '{stock_lifecycle_state}', '"restored"'::jsonb, true);
    d := jsonb_set(d, '{stock_restored_at}', to_jsonb(now()::text), true);
    d := jsonb_set(d, '{stock_restored_quantity}', to_jsonb(requested_qty), true);
    new.details := d;
    return new;
  end if;

  return new;
end;
$$;

-- Remove the old paid-only trigger if it exists, then install the complete lifecycle trigger.
drop trigger if exists trg_meshwar_deduct_local_stock_on_paid on public.orders;
drop trigger if exists trg_meshwar_local_stock_status_lifecycle on public.orders;

create trigger trg_meshwar_local_stock_status_lifecycle
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_local_stock_status_lifecycle();
