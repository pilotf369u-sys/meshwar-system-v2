-- KINTO V93 Stage 4 — local cart bundle checkout lifecycle.
-- Frontend submits one pending order per scoped store with details.source = local_cart_bundle.
-- Pending/cancelled orders do not mutate stock. Stock is deducted atomically only when
-- status first becomes "تم التسديد". Bundle items become immutable after submission,
-- and a paid bundle cannot be moved back to another status.

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

  if old.status = 'تم التسديد' and (
    new.status is distinct from old.status or
    new.details is distinct from old.details
  ) then
    raise exception 'Paid local cart bundle is locked';
  end if;

  if coalesce(old_d->'items','[]'::jsonb) is distinct from coalesce(new_d->'items','[]'::jsonb)
     or coalesce(old_d->>'quantity','') is distinct from coalesce(new_d->>'quantity','')
     or coalesce(old_d->>'requested_quantity','') is distinct from coalesce(new_d->>'requested_quantity','') then
    raise exception 'Local cart bundle items are immutable after submission';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_guard on public.orders;
create trigger trg_meshwar_local_cart_bundle_guard
before update of status, details on public.orders
for each row
execute function public.meshwar_local_cart_bundle_guard();

create or replace function public.meshwar_local_cart_bundle_stock_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  rec record;
  current_stock integer;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  begin
    d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(d->>'source','') <> 'local_cart_bundle' then
    return new;
  end if;

  -- Pending / rejected / customer-cancelled bundles never affect stock.
  if new.status <> 'تم التسديد' then
    return new;
  end if;

  if coalesce(d->>'bundle_stock_lifecycle_state','') = 'deducted' then
    return new;
  end if;

  if jsonb_typeof(d->'items') <> 'array' or jsonb_array_length(d->'items') = 0 then
    raise exception 'Local cart bundle has no items';
  end if;

  -- Validate and lock every product first. Quantities are aggregated by product_id so
  -- different option rows for the same product cannot collectively overdraw stock.
  for rec in
    select nullif(item->>'product_id','')::uuid as product_id,
           sum(greatest(1, coalesce(nullif(item->>'quantity','')::integer, 1)))::integer as requested_qty
      from jsonb_array_elements(d->'items') item
     group by nullif(item->>'product_id','')::uuid
     order by nullif(item->>'product_id','')::uuid
  loop
    if rec.product_id is null then
      raise exception 'Local cart bundle contains an invalid product id';
    end if;

    select stock_quantity
      into current_stock
      from public.local_products
     where id = rec.product_id
     for update;

    if not found then
      raise exception 'Local product % was not found', rec.product_id;
    end if;

    -- Null stock remains unmanaged for legacy compatibility.
    if current_stock is not null and current_stock < rec.requested_qty then
      raise exception 'Insufficient stock for product %. Available %, requested %',
        rec.product_id, current_stock, rec.requested_qty;
    end if;
  end loop;

  for rec in
    select nullif(item->>'product_id','')::uuid as product_id,
           sum(greatest(1, coalesce(nullif(item->>'quantity','')::integer, 1)))::integer as requested_qty
      from jsonb_array_elements(d->'items') item
     group by nullif(item->>'product_id','')::uuid
     order by nullif(item->>'product_id','')::uuid
  loop
    update public.local_products
       set stock_quantity = stock_quantity - rec.requested_qty,
           is_out_of_stock = (stock_quantity - rec.requested_qty) = 0
     where id = rec.product_id
       and stock_quantity is not null;
  end loop;

  d := jsonb_set(d, '{bundle_stock_lifecycle_state}', '"deducted"'::jsonb, true);
  d := jsonb_set(d, '{bundle_stock_deducted_at}', to_jsonb(now()::text), true);
  new.details := d;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_stock_lifecycle on public.orders;
create trigger trg_meshwar_local_cart_bundle_stock_lifecycle
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_local_cart_bundle_stock_lifecycle();
