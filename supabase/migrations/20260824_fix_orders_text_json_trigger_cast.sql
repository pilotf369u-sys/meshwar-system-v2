-- Repair orders triggers for deployments where public.orders.details is TEXT.
-- Safe/idempotent: keeps the current trigger names and stock lifecycle behavior,
-- but JSON operators are applied only to JSONB values created with explicit casts.
-- Assignments back to NEW.details are explicit TEXT.

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

  if coalesce(d->>'source','') <> 'local_store' then return new; end if;

  if coalesce(d->>'color','') = '' and coalesce(d->>'selected_color','') <> '' then
    d := jsonb_set(d, '{color}', to_jsonb(d->>'selected_color'), true);
  end if;
  if coalesce(d->>'size','') = '' and coalesce(d->>'selected_size','') <> '' then
    d := jsonb_set(d, '{size}', to_jsonb(d->>'selected_size'), true);
  end if;
  if coalesce(d->>'volume','') = '' and coalesce(d->>'selected_volume','') <> '' then
    d := jsonb_set(d, '{volume}', to_jsonb(d->>'selected_volume'), true);
  end if;
  if coalesce(d->>'selected_color','') = '' and coalesce(d->>'color','') <> '' then
    d := jsonb_set(d, '{selected_color}', to_jsonb(d->>'color'), true);
  end if;
  if coalesce(d->>'selected_size','') = '' and coalesce(d->>'size','') <> '' then
    d := jsonb_set(d, '{selected_size}', to_jsonb(d->>'size'), true);
  end if;
  if coalesce(d->>'selected_volume','') = '' and coalesce(d->>'volume','') <> '' then
    d := jsonb_set(d, '{selected_volume}', to_jsonb(d->>'volume'), true);
  end if;

  new.details := d::text;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_normalize_local_order_details on public.orders;
create trigger trg_meshwar_normalize_local_order_details
before insert or update of details on public.orders
for each row execute function public.meshwar_normalize_local_order_details();

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
    requested_qty := greatest(1, coalesce(
      nullif(d->>'requested_quantity','')::integer,
      nullif(d->>'quantity','')::integer,
      1
    ));
  exception when others then
    return new;
  end;

  lifecycle_state := coalesce(d->>'stock_lifecycle_state','');
  rejected_or_cancelled := new.status = any(array[
    'مرفوض','رفض التسليم','رفض الطلب','ملغي من قبل العميل','ملغي','ملغى'
  ]);

  if new.status = 'تم التسديد' then
    if lifecycle_state = 'deducted' then return new; end if;

    if lifecycle_state = ''
       and coalesce(d->>'stock_deducted_at','') <> ''
       and coalesce(d->>'stock_restored_at','') = '' then
      d := jsonb_set(d, '{stock_lifecycle_state}', '"deducted"'::jsonb, true);
      new.details := d::text;
      return new;
    end if;

    select stock_quantity, coalesce(options, '{}'::jsonb)
      into current_stock, current_options
      from public.local_products
     where id = product_uuid
     for update;

    if not found then raise exception 'Local product % was not found', product_uuid; end if;
    if current_stock is null then return new; end if;
    if current_stock < requested_qty then
      raise exception 'Insufficient stock for product %. Available %, requested %',
        product_uuid, current_stock, requested_qty;
    end if;

    next_options := public.meshwar_adjust_variant_stock(current_options, d, requested_qty, -1);

    update public.local_products
       set stock_quantity = current_stock - requested_qty,
           options = next_options,
           is_out_of_stock = (current_stock - requested_qty) = 0
     where id = product_uuid;

    d := jsonb_set(d, '{stock_lifecycle_state}', '"deducted"'::jsonb, true);
    d := jsonb_set(d, '{stock_deducted_at}', to_jsonb(now()::text), true);
    d := jsonb_set(d, '{stock_deducted_quantity}', to_jsonb(requested_qty), true);
    d := d - 'stock_restored_at' - 'stock_restored_quantity';
    new.details := d::text;
    return new;
  end if;

  if rejected_or_cancelled then
    if lifecycle_state <> 'deducted' then
      if not (
        lifecycle_state = ''
        and coalesce(d->>'stock_deducted_at','') <> ''
        and coalesce(d->>'stock_restored_at','') = ''
      ) then return new; end if;
    end if;

    select stock_quantity, coalesce(options, '{}'::jsonb)
      into current_stock, current_options
      from public.local_products
     where id = product_uuid
     for update;

    if not found then raise exception 'Local product % was not found', product_uuid; end if;
    if current_stock is null then return new; end if;

    next_options := public.meshwar_adjust_variant_stock(current_options, d, requested_qty, 1);

    update public.local_products
       set stock_quantity = current_stock + requested_qty,
           options = next_options,
           is_out_of_stock = false
     where id = product_uuid;

    d := jsonb_set(d, '{stock_lifecycle_state}', '"restored"'::jsonb, true);
    d := jsonb_set(d, '{stock_restored_at}', to_jsonb(now()::text), true);
    d := jsonb_set(d, '{stock_restored_quantity}', to_jsonb(requested_qty), true);
    new.details := d::text;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_meshwar_deduct_local_stock_on_paid on public.orders;
drop trigger if exists trg_meshwar_local_stock_status_lifecycle on public.orders;
create trigger trg_meshwar_local_stock_status_lifecycle
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.meshwar_local_stock_status_lifecycle();

-- The cost-snapshot trigger exists in some live deployments but was never captured
-- in repository migrations. Preserve its exact live definition and patch only unsafe
-- direct JSON operators on the TEXT-backed NEW.details column.
do $$
declare
  fn_oid oid;
  fn_sql text;
  patched_sql text;
begin
  select p.oid
    into fn_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'meshwar_lock_order_cost_snapshot'
     and p.pronargs = 0
   limit 1;

  if fn_oid is not null then
    fn_sql := pg_get_functiondef(fn_oid);

    patched_sql := regexp_replace(
      fn_sql,
      'new\s*\.\s*details\s*->>',
      '(new.details::jsonb)->>',
      'gi'
    );
    patched_sql := regexp_replace(
      patched_sql,
      'new\s*\.\s*details\s*->',
      '(new.details::jsonb)->',
      'gi'
    );

    if patched_sql is distinct from fn_sql then
      execute patched_sql;
    end if;
  end if;
end;
$$;

-- Post-migration guard: fail loudly if any trigger function currently attached to
-- public.orders still contains a direct NEW.details -> / ->> expression.
do $$
declare
  offender text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into offender
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.orders'::regclass
     and not t.tgisinternal
     and pg_get_functiondef(p.oid) ~* 'new\s*\.\s*details\s*->>?';

  if offender is not null then
    raise exception 'Unsafe TEXT JSON operator remains in orders trigger function(s): %', offender;
  end if;
end;
$$;
