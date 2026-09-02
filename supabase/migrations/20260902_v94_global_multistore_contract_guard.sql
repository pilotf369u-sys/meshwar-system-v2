-- KINTO V94 — Global Order + Store Segmentation + Financial Visibility integrity guard.
-- Keeps submitted multi-store financial/product segmentation immutable while allowing
-- operational metadata and per-store post-payment workflow statuses to change.

create or replace function public.meshwar_local_cart_bundle_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_d jsonb := '{}'::jsonb;
  new_d jsonb := '{}'::jsonb;
  store_rec record;
  old_store_status text;
  new_store_status text;
  old_rank integer;
  new_rank integer;
  paid_lifecycle boolean := false;
  cancelled_statuses constant text[] := array[
    'مرفوض','رفض التسليم','رفض الطلب','ملغي من قبل العميل','ملغي','ملغى'
  ];
begin
  begin
    if old.details is not null and btrim(old.details::text) <> '' then
      old_d := old.details::jsonb;
    end if;
  exception when others then
    return new;
  end;

  if coalesce(old_d->>'source','') <> 'local_cart_bundle' then
    return new;
  end if;

  begin
    if new.details is not null and btrim(new.details::text) <> '' then
      new_d := new.details::jsonb;
    else
      new_d := old_d;
    end if;
  exception when others then
    new_d := old_d;
  end;

  -- V94 post-payment cancellation lock. Delivery/branch operational statuses remain allowed;
  -- only cancellation/rejection transitions are blocked after stock was deducted.
  paid_lifecycle := coalesce(old_d->>'bundle_stock_lifecycle_state','') = 'deducted'
                 or old.status = 'تم التسديد';
  if paid_lifecycle
     and new.status is distinct from old.status
     and new.status = any(cancelled_statuses) then
    raise exception 'V94 paid global order cannot be cancelled or rejected';
  end if;

  -- Immutable submitted product + financial segmentation contract.
  new_d := jsonb_set(new_d, '{source}', coalesce(old_d->'source','"local_cart_bundle"'::jsonb), true);
  new_d := jsonb_set(new_d, '{items}', coalesce(old_d->'items','[]'::jsonb), true);

  if old_d->'quantity' is not null then
    new_d := jsonb_set(new_d,'{quantity}',old_d->'quantity',true);
  end if;
  if old_d->'requested_quantity' is not null then
    new_d := jsonb_set(new_d,'{requested_quantity}',old_d->'requested_quantity',true);
  end if;
  if old_d->'item_count' is not null then
    new_d := jsonb_set(new_d,'{item_count}',old_d->'item_count',true);
  end if;
  if old_d->'bundle_id' is not null then
    new_d := jsonb_set(new_d,'{bundle_id}',old_d->'bundle_id',true);
  end if;
  if old_d->'bundle_version' is not null then
    new_d := jsonb_set(new_d,'{bundle_version}',old_d->'bundle_version',true);
  end if;
  if old_d->'customer_scope_id' is not null then
    new_d := jsonb_set(new_d,'{customer_scope_id}',old_d->'customer_scope_id',true);
  end if;
  if old_d->'customer_scope_type' is not null then
    new_d := jsonb_set(new_d,'{customer_scope_type}',old_d->'customer_scope_type',true);
  end if;
  if old_d->'submitted_at' is not null then
    new_d := jsonb_set(new_d,'{submitted_at}',old_d->'submitted_at',true);
  end if;
  if old_d->'customer_total_local' is not null then
    new_d := jsonb_set(new_d,'{customer_total_local}',old_d->'customer_total_local',true);
  end if;
  if old_d->'stores' is not null then
    new_d := jsonb_set(new_d,'{stores}',old_d->'stores',true);
  end if;
  if old_d->'multi_store' is not null then
    new_d := jsonb_set(new_d,'{multi_store}',old_d->'multi_store',true);
  end if;
  if old_d->'cancellation_policy' is not null then
    new_d := jsonb_set(new_d,'{cancellation_policy}',old_d->'cancellation_policy',true);
  end if;

  -- Per-store workflow is operational, but only after payment/stock deduction and only
  -- for stores that are part of the immutable submitted stores[] contract.
  if coalesce(new_d->'store_statuses','{}'::jsonb) is distinct from coalesce(old_d->'store_statuses','{}'::jsonb) then
    if not paid_lifecycle then
      raise exception 'V94 store workflow can change only after payment';
    end if;

    if jsonb_typeof(coalesce(new_d->'store_statuses','{}'::jsonb)) <> 'object' then
      raise exception 'V94 store_statuses must be a JSON object';
    end if;

    for store_rec in
      select value->>'store_id' as store_id
        from jsonb_array_elements(coalesce(old_d->'stores','[]'::jsonb))
    loop
      if store_rec.store_id is null or btrim(store_rec.store_id) = '' then
        continue;
      end if;

      old_store_status := coalesce(old_d->'store_statuses'->>store_rec.store_id,'بانتظار التسديد');
      new_store_status := coalesce(new_d->'store_statuses'->>store_rec.store_id,old_store_status);

      old_rank := case old_store_status
        when 'بانتظار التسديد' then 0
        when 'قيد التجهيز' then 1
        when 'جاهز للتسليم للمندوب' then 2
        when 'تم التسليم للمندوب' then 3
        else -1
      end;
      new_rank := case new_store_status
        when 'بانتظار التسديد' then 0
        when 'قيد التجهيز' then 1
        when 'جاهز للتسليم للمندوب' then 2
        when 'تم التسليم للمندوب' then 3
        else -1
      end;

      if old_rank < 0 or new_rank < 0 then
        raise exception 'Invalid V94 store workflow status for store %', store_rec.store_id;
      end if;
      if new_rank < old_rank then
        raise exception 'V94 store workflow cannot move backwards for store %', store_rec.store_id;
      end if;
    end loop;

    -- Reject injected store keys that do not exist in submitted stores[].
    if exists (
      select 1
        from jsonb_object_keys(coalesce(new_d->'store_statuses','{}'::jsonb)) k
       where not exists (
         select 1
           from jsonb_array_elements(coalesce(old_d->'stores','[]'::jsonb)) s
          where s->>'store_id' = k
       )
    ) then
      raise exception 'V94 store_statuses contains an unknown store';
    end if;
  end if;

  new.details := new_d::text;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_guard on public.orders;
create trigger trg_meshwar_local_cart_bundle_guard
before update of status, details on public.orders
for each row
execute function public.meshwar_local_cart_bundle_guard();

comment on function public.meshwar_local_cart_bundle_guard() is
'V94 global bundle guard: immutable items/stores/customer total, post-payment cancellation lock, monotonic per-store workflow statuses.';
