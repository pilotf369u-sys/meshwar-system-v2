-- KINTO V93 critical stock integrity fix.
-- Bundle checkout already deducts local_products.stock_quantity on "تم التسديد".
-- This replacement also deducts each sold item's configured variant_stock and
-- matrix_stock using the existing lifecycle helpers, in the same transaction.

create or replace function public.meshwar_local_cart_bundle_stock_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  product_rec record;
  item_rec record;
  current_stock integer;
  current_options jsonb;
  next_options jsonb;
  item_details jsonb;
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

  -- Exactly-once protection.
  if coalesce(d->>'bundle_stock_lifecycle_state','') = 'deducted' then
    return new;
  end if;

  if jsonb_typeof(d->'items') <> 'array' or jsonb_array_length(d->'items') = 0 then
    raise exception 'Local cart bundle has no items';
  end if;

  -- Validate product ids/quantities and lock every affected product in stable order.
  -- Aggregating total quantity here prevents different option rows for one product
  -- from collectively overdrawing local_products.stock_quantity.
  for product_rec in
    select nullif(item->>'product_id','')::uuid as product_id,
           sum(greatest(1, coalesce(nullif(item->>'quantity','')::integer, 1)))::integer as requested_qty
      from jsonb_array_elements(d->'items') item
     group by nullif(item->>'product_id','')::uuid
     order by nullif(item->>'product_id','')::uuid
  loop
    if product_rec.product_id is null then
      raise exception 'Local cart bundle contains an invalid product id';
    end if;

    select stock_quantity
      into current_stock
      from public.local_products
     where id = product_rec.product_id
     for update;

    if not found then
      raise exception 'Local product % was not found', product_rec.product_id;
    end if;

    if current_stock is not null and current_stock < product_rec.requested_qty then
      raise exception 'Insufficient stock for product %. Available %, requested %',
        product_rec.product_id, current_stock, product_rec.requested_qty;
    end if;
  end loop;

  -- Process one locked product at a time. Every option row is applied to an in-memory
  -- copy first; any insufficient configured variant/matrix raises before that product
  -- is updated, and PostgreSQL rolls the whole order status transaction back.
  for product_rec in
    select nullif(item->>'product_id','')::uuid as product_id,
           sum(greatest(1, coalesce(nullif(item->>'quantity','')::integer, 1)))::integer as requested_qty
      from jsonb_array_elements(d->'items') item
     group by nullif(item->>'product_id','')::uuid
     order by nullif(item->>'product_id','')::uuid
  loop
    select stock_quantity, coalesce(options, '{}'::jsonb)
      into current_stock, current_options
      from public.local_products
     where id = product_rec.product_id;

    next_options := current_options;

    for item_rec in
      select item,
             greatest(1, coalesce(nullif(item->>'quantity','')::integer, 1))::integer as requested_qty
        from jsonb_array_elements(d->'items') item
       where nullif(item->>'product_id','')::uuid = product_rec.product_id
    loop
      -- Existing stock helpers expect color/size/volume at the top level. V93 bundle
      -- items persist them under selected_options, so flatten only those selections.
      item_details := jsonb_build_object(
        'color',  coalesce(item_rec.item->'selected_options'->>'color',  item_rec.item->>'color',  ''),
        'size',   coalesce(item_rec.item->'selected_options'->>'size',   item_rec.item->>'size',   ''),
        'volume', coalesce(item_rec.item->'selected_options'->>'volume', item_rec.item->>'volume', '')
      );

      next_options := public.meshwar_adjust_variant_stock(
        next_options,
        item_details,
        item_rec.requested_qty,
        -1
      );
      next_options := public.meshwar_adjust_matrix_stock(
        next_options,
        item_details,
        item_rec.requested_qty,
        -1
      );
    end loop;

    -- One atomic row update keeps total, variants, matrix combinations and availability
    -- synchronized. Legacy null total stock stays unmanaged while option JSON is retained.
    if current_stock is not null then
      update public.local_products
         set stock_quantity = current_stock - product_rec.requested_qty,
             options = next_options,
             is_out_of_stock = (current_stock - product_rec.requested_qty) = 0
       where id = product_rec.product_id;
    end if;
  end loop;

  d := jsonb_set(d, '{bundle_stock_lifecycle_state}', '"deducted"'::jsonb, true);
  d := jsonb_set(d, '{bundle_stock_deducted_at}', to_jsonb(now()::text), true);
  d := jsonb_set(d, '{bundle_variant_stock_deducted}', 'true'::jsonb, true);
  new.details := d;
  return new;
end;
$$;

-- Reinstall the active bundle lifecycle trigger idempotently.
drop trigger if exists trg_meshwar_local_cart_bundle_stock_lifecycle on public.orders;
create trigger trg_meshwar_local_cart_bundle_stock_lifecycle
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_local_cart_bundle_stock_lifecycle();
