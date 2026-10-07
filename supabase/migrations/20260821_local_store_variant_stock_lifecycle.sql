-- MeshWar local-store variant stock lifecycle
-- Extends the existing paid/cancelled stock lifecycle without schema changes.
-- Variant stock lives inside local_products.options.variant_stock.
--
-- Rules:
--   * Order creation keeps the existing behavior: no final deduction.
--   * When an order becomes "تم التسديد", total stock and every configured selected
--     variant are deducted atomically in ONE UPDATE of local_products.
--   * When a previously deducted order becomes rejected/cancelled, total stock and
--     the same configured selected variants are restored atomically.
--   * Missing variant_stock entries remain backward-compatible and use total stock.
--   * A configured variant can never be deducted below zero.

create or replace function public.meshwar_adjust_variant_stock(
  p_options jsonb,
  p_details jsonb,
  p_qty integer,
  p_direction integer
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  result_options jsonb := coalesce(p_options, '{}'::jsonb);
  variant_stock jsonb := coalesce(p_options->'variant_stock', '{}'::jsonb);
  group_key text;
  legacy_group_key text;
  selected_value text;
  current_qty integer;
  next_qty integer;
  target_group text;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'Variant stock quantity must be at least 1';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Variant stock direction must be -1 or 1';
  end if;

  for group_key, legacy_group_key, selected_value in
    select * from (values
      ('color'::text,  'colors'::text,  coalesce(nullif(p_details->>'color',''),  nullif(p_details->>'selected_color',''))),
      ('size'::text,   'sizes'::text,   coalesce(nullif(p_details->>'size',''),   nullif(p_details->>'selected_size',''))),
      ('volume'::text, 'volumes'::text, coalesce(nullif(p_details->>'volume',''), nullif(p_details->>'selected_volume','')))
    ) as selected_variants(group_key, legacy_group_key, selected_value)
  loop
    if selected_value is null or btrim(selected_value) = '' then
      continue;
    end if;

    target_group := null;
    if jsonb_typeof(variant_stock->group_key) = 'object'
       and (variant_stock->group_key) ? selected_value then
      target_group := group_key;
    elsif jsonb_typeof(variant_stock->legacy_group_key) = 'object'
       and (variant_stock->legacy_group_key) ? selected_value then
      target_group := legacy_group_key;
    end if;

    -- No configured per-variant quantity: preserve legacy total-stock behavior.
    if target_group is null then
      continue;
    end if;

    begin
      current_qty := (variant_stock->target_group->>selected_value)::integer;
    exception when others then
      raise exception 'Invalid variant stock for %=%', group_key, selected_value;
    end;

    if current_qty < 0 then
      raise exception 'Invalid negative variant stock for %=%', group_key, selected_value;
    end if;

    if p_direction = -1 and current_qty < p_qty then
      raise exception 'Insufficient variant stock for %=%: available %, requested %',
        group_key, selected_value, current_qty, p_qty;
    end if;

    next_qty := current_qty + (p_direction * p_qty);
    if next_qty < 0 then
      raise exception 'Variant stock cannot become negative for %=%', group_key, selected_value;
    end if;

    variant_stock := jsonb_set(
      variant_stock,
      array[target_group, selected_value],
      to_jsonb(next_qty),
      false
    );
  end loop;

  return jsonb_set(result_options, '{variant_stock}', variant_stock, true);
end;
$$;


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
  current_options jsonb;
  next_options jsonb;
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

  -- PAID: deduct total + configured selected variants exactly once.
  if new.status = 'تم التسديد' then
    if lifecycle_state = 'deducted' then
      return new;
    end if;

    -- Backward compatibility with an older lifecycle marker.
    if lifecycle_state = ''
       and coalesce(d->>'stock_deducted_at','') <> ''
       and coalesce(d->>'stock_restored_at','') = '' then
      d := jsonb_set(d, '{stock_lifecycle_state}', '"deducted"'::jsonb, true);
      new.details := d;
      return new;
    end if;

    select stock_quantity, coalesce(options, '{}'::jsonb)
      into current_stock, current_options
      from public.local_products
     where id = product_uuid
     for update;

    if not found then
      raise exception 'Local product % was not found', product_uuid;
    end if;

    -- Preserve legacy products with unmanaged/null total stock.
    if current_stock is null then
      return new;
    end if;

    if current_stock < requested_qty then
      raise exception 'Insufficient stock for product %. Available %, requested %',
        product_uuid, current_stock, requested_qty;
    end if;

    -- This validates all configured selected variants before the row is changed.
    next_options := public.meshwar_adjust_variant_stock(
      current_options,
      d,
      requested_qty,
      -1
    );

    -- Atomic row update: total stock + variant stock + availability together.
    update public.local_products
       set stock_quantity = current_stock - requested_qty,
           options = next_options,
           is_out_of_stock = (current_stock - requested_qty) = 0
     where id = product_uuid;

    d := jsonb_set(d, '{stock_lifecycle_state}', '"deducted"'::jsonb, true);
    d := jsonb_set(d, '{stock_deducted_at}', to_jsonb(now()::text), true);
    d := jsonb_set(d, '{stock_deducted_quantity}', to_jsonb(requested_qty), true);
    d := d - 'stock_restored_at' - 'stock_restored_quantity';
    new.details := d;
    return new;
  end if;

  -- REJECTED / CANCELLED: restore total + the same configured selected variants.
  if rejected_or_cancelled then
    if lifecycle_state <> 'deducted' then
      if not (
        lifecycle_state = ''
        and coalesce(d->>'stock_deducted_at','') <> ''
        and coalesce(d->>'stock_restored_at','') = ''
      ) then
        return new;
      end if;
    end if;

    select stock_quantity, coalesce(options, '{}'::jsonb)
      into current_stock, current_options
      from public.local_products
     where id = product_uuid
     for update;

    if not found then
      raise exception 'Local product % was not found', product_uuid;
    end if;

    if current_stock is null then
      return new;
    end if;

    next_options := public.meshwar_adjust_variant_stock(
      current_options,
      d,
      requested_qty,
      1
    );

    -- Atomic restore of total and variant stock in the same row update.
    update public.local_products
       set stock_quantity = current_stock + requested_qty,
           options = next_options,
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

-- Reinstall the same lifecycle trigger so this migration is standalone/idempotent.
drop trigger if exists trg_meshwar_deduct_local_stock_on_paid on public.orders;
drop trigger if exists trg_meshwar_local_stock_status_lifecycle on public.orders;

create trigger trg_meshwar_local_stock_status_lifecycle
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_local_stock_status_lifecycle();
