-- MeshWar V6 matrix combination stock lifecycle
-- No schema changes. Combination stock is stored in local_products.options.matrix_stock.
-- Matrix keys are built from selected non-empty values in fixed order: color_size_volume.
-- Example: {"وردي_6 سنوات": 1, "وردي_8 سنوات": 0}

create or replace function public.meshwar_matrix_stock_key(p_details jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  parts text[] := array[]::text[];
  v text;
begin
  v := coalesce(nullif(p_details->>'color',''), nullif(p_details->>'selected_color',''));
  if v is not null and btrim(v) <> '' then parts := array_append(parts, btrim(v)); end if;

  v := coalesce(nullif(p_details->>'size',''), nullif(p_details->>'selected_size',''));
  if v is not null and btrim(v) <> '' then parts := array_append(parts, btrim(v)); end if;

  v := coalesce(nullif(p_details->>'volume',''), nullif(p_details->>'selected_volume',''));
  if v is not null and btrim(v) <> '' then parts := array_append(parts, btrim(v)); end if;

  if coalesce(array_length(parts,1),0) < 2 then
    return null;
  end if;

  return array_to_string(parts, '_');
end;
$$;

create or replace function public.meshwar_adjust_matrix_stock(
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
  matrix_stock jsonb := coalesce(p_options->'matrix_stock', '{}'::jsonb);
  matrix_key text;
  current_qty integer;
  next_qty integer;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'Matrix stock quantity must be at least 1';
  end if;
  if p_direction not in (-1,1) then
    raise exception 'Matrix stock direction must be -1 or 1';
  end if;

  matrix_key := public.meshwar_matrix_stock_key(p_details);
  if matrix_key is null then
    return result_options;
  end if;

  if jsonb_typeof(matrix_stock) <> 'object' or not (matrix_stock ? matrix_key) then
    return result_options;
  end if;

  begin
    current_qty := (matrix_stock->>matrix_key)::integer;
  exception when others then
    raise exception 'Invalid matrix stock for combination %', matrix_key;
  end;

  if current_qty < 0 then
    raise exception 'Invalid negative matrix stock for combination %', matrix_key;
  end if;

  if p_direction = -1 and current_qty < p_qty then
    raise exception 'Insufficient matrix stock for combination %. Available %, requested %',
      matrix_key, current_qty, p_qty;
  end if;

  next_qty := current_qty + (p_direction * p_qty);
  if next_qty < 0 then
    raise exception 'Matrix stock cannot become negative for combination %', matrix_key;
  end if;

  matrix_stock := jsonb_set(matrix_stock, array[matrix_key], to_jsonb(next_qty), false);
  return jsonb_set(result_options, '{matrix_stock}', matrix_stock, true);
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
  if old.status is not distinct from new.status then return new; end if;

  begin
    d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(d->>'source','') <> 'local_store' then return new; end if;

  begin
    product_uuid := nullif(d->>'product_id','')::uuid;
    requested_qty := greatest(1,coalesce(nullif(d->>'requested_quantity','')::integer,nullif(d->>'quantity','')::integer,1));
  exception when others then
    return new;
  end;

  lifecycle_state := coalesce(d->>'stock_lifecycle_state','');
  rejected_or_cancelled := new.status = any(array['مرفوض','رفض التسليم','رفض الطلب','ملغي من قبل العميل','ملغي','ملغى']);

  if new.status = 'تم التسديد' then
    if lifecycle_state = 'deducted' then return new; end if;

    if lifecycle_state = ''
       and coalesce(d->>'stock_deducted_at','') <> ''
       and coalesce(d->>'stock_restored_at','') = '' then
      d := jsonb_set(d,'{stock_lifecycle_state}','"deducted"'::jsonb,true);
      new.details := d;
      return new;
    end if;

    select stock_quantity,coalesce(options,'{}'::jsonb)
      into current_stock,current_options
      from public.local_products
     where id=product_uuid
     for update;

    if not found then raise exception 'Local product % was not found',product_uuid; end if;
    if current_stock is null then return new; end if;
    if current_stock < requested_qty then
      raise exception 'Insufficient stock for product %. Available %, requested %',product_uuid,current_stock,requested_qty;
    end if;

    -- Validate and adjust both per-dimension stock and exact matrix combination before UPDATE.
    next_options := public.meshwar_adjust_variant_stock(current_options,d,requested_qty,-1);
    next_options := public.meshwar_adjust_matrix_stock(next_options,d,requested_qty,-1);

    -- One atomic row UPDATE for total stock + variant stock + matrix stock + availability.
    update public.local_products
       set stock_quantity=current_stock-requested_qty,
           options=next_options,
           is_out_of_stock=(current_stock-requested_qty)=0
     where id=product_uuid;

    d := jsonb_set(d,'{stock_lifecycle_state}','"deducted"'::jsonb,true);
    d := jsonb_set(d,'{stock_deducted_at}',to_jsonb(now()::text),true);
    d := jsonb_set(d,'{stock_deducted_quantity}',to_jsonb(requested_qty),true);
    d := jsonb_set(d,'{matrix_stock_key}',to_jsonb(public.meshwar_matrix_stock_key(d)),true);
    d := d-'stock_restored_at'-'stock_restored_quantity';
    new.details := d;
    return new;
  end if;

  if rejected_or_cancelled then
    if lifecycle_state <> 'deducted' then
      if not (lifecycle_state='' and coalesce(d->>'stock_deducted_at','')<>'' and coalesce(d->>'stock_restored_at','')='') then
        return new;
      end if;
    end if;

    select stock_quantity,coalesce(options,'{}'::jsonb)
      into current_stock,current_options
      from public.local_products
     where id=product_uuid
     for update;

    if not found then raise exception 'Local product % was not found',product_uuid; end if;
    if current_stock is null then return new; end if;

    next_options := public.meshwar_adjust_variant_stock(current_options,d,requested_qty,1);
    next_options := public.meshwar_adjust_matrix_stock(next_options,d,requested_qty,1);

    update public.local_products
       set stock_quantity=current_stock+requested_qty,
           options=next_options,
           is_out_of_stock=false
     where id=product_uuid;

    d := jsonb_set(d,'{stock_lifecycle_state}','"restored"'::jsonb,true);
    d := jsonb_set(d,'{stock_restored_at}',to_jsonb(now()::text),true);
    d := jsonb_set(d,'{stock_restored_quantity}',to_jsonb(requested_qty),true);
    new.details := d;
    return new;
  end if;

  return new;
end;
$$;

-- The repository's active lifecycle trigger uses meshwar_local_stock_status_lifecycle().
drop trigger if exists trg_meshwar_deduct_local_stock_on_paid on public.orders;
drop trigger if exists trg_meshwar_local_stock_status_lifecycle on public.orders;

create trigger trg_meshwar_local_stock_status_lifecycle
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_local_stock_status_lifecycle();
