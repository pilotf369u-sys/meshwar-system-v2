-- KINTO V94 — Global multi-store order contract + role financial visibility backend helpers.
-- Scope:
--   * one global order / one KN for all selected local stores;
--   * immutable submitted items and immutable per-store financial shares;
--   * global cancellation/status changes are blocked after payment;
--   * per-store operational status remains independently mutable after payment;
--   * vendor RPC returns ONLY that store's items + subtotal (never global totals / other stores).

create or replace function public.meshwar_local_cart_bundle_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_d jsonb := '{}'::jsonb;
  new_d jsonb := '{}'::jsonb;
  old_stores jsonb := '[]'::jsonb;
  new_stores jsonb := '[]'::jsonb;
  merged_stores jsonb := '[]'::jsonb;
  old_store jsonb;
  requested_store jsonb;
  requested_status text;
  requested_status_updated_at jsonb;
  v94 boolean := false;
begin
  begin
    if old.details is not null and btrim(old.details::text) <> '' then old_d := old.details::jsonb; end if;
  exception when others then
    return new;
  end;

  if coalesce(old_d->>'source','') <> 'local_cart_bundle' then return new; end if;

  begin
    if new.details is not null and btrim(new.details::text) <> '' then new_d := new.details::jsonb; else new_d := old_d; end if;
  exception when others then
    new_d := old_d;
  end;

  v94 := coalesce(old_d->>'bundle_version','') = 'v94-global-multistore' or lower(coalesce(old_d->>'multi_store','false')) = 'true';

  -- Global cancellation/status rollback is forbidden after payment for V94.
  if v94 and old.status = 'تم التسديد' and new.status is distinct from old.status then
    raise exception 'Paid V94 global order status is locked; use per-store operational status instead';
  end if;

  -- Core submitted identity/product contract is immutable.
  new_d := jsonb_set(new_d,'{source}',coalesce(old_d->'source','"local_cart_bundle"'::jsonb),true);
  new_d := jsonb_set(new_d,'{items}',coalesce(old_d->'items','[]'::jsonb),true);

  if old_d->'quantity' is not null then new_d := jsonb_set(new_d,'{quantity}',old_d->'quantity',true); end if;
  if old_d->'requested_quantity' is not null then new_d := jsonb_set(new_d,'{requested_quantity}',old_d->'requested_quantity',true); end if;
  if old_d->'item_count' is not null then new_d := jsonb_set(new_d,'{item_count}',old_d->'item_count',true); end if;
  if old_d->'store_count' is not null then new_d := jsonb_set(new_d,'{store_count}',old_d->'store_count',true); end if;
  if old_d->'bundle_id' is not null then new_d := jsonb_set(new_d,'{bundle_id}',old_d->'bundle_id',true); end if;
  if old_d->'bundle_version' is not null then new_d := jsonb_set(new_d,'{bundle_version}',old_d->'bundle_version',true); end if;
  if old_d->'multi_store' is not null then new_d := jsonb_set(new_d,'{multi_store}',old_d->'multi_store',true); end if;
  if old_d->'goods_total_local' is not null then new_d := jsonb_set(new_d,'{goods_total_local}',old_d->'goods_total_local',true); end if;
  if old_d->'customer_scope_id' is not null then new_d := jsonb_set(new_d,'{customer_scope_id}',old_d->'customer_scope_id',true); end if;
  if old_d->'customer_scope_type' is not null then new_d := jsonb_set(new_d,'{customer_scope_type}',old_d->'customer_scope_type',true); end if;
  if old_d->'submitted_at' is not null then new_d := jsonb_set(new_d,'{submitted_at}',old_d->'submitted_at',true); end if;
  if old_d->'local_currency' is not null then new_d := jsonb_set(new_d,'{local_currency}',old_d->'local_currency',true); end if;

  -- V94 store segmentation: every financial field is copied from OLD; only operational
  -- status/status_updated_at may be taken from NEW. This prevents a vendor/frontend from
  -- changing store_id, store_name, subtotal_local, quantity or item_count after checkout.
  if v94 and jsonb_typeof(old_d->'stores') = 'array' then
    old_stores := old_d->'stores';
    if jsonb_typeof(new_d->'stores') = 'array' then new_stores := new_d->'stores'; end if;

    for old_store in select value from jsonb_array_elements(old_stores)
    loop
      requested_store := null;
      select value into requested_store
        from jsonb_array_elements(new_stores)
       where value->>'store_id' = old_store->>'store_id'
       limit 1;

      requested_status := coalesce(requested_store->>'status', old_store->>'status', 'بانتظار التسديد');
      requested_status_updated_at := coalesce(requested_store->'status_updated_at', old_store->'status_updated_at', 'null'::jsonb);

      -- When the global order first becomes paid, every store independently enters
      -- the post-payment preparation lifecycle.
      if new.status = 'تم التسديد' and old.status is distinct from 'تم التسديد' then
        requested_status := 'بانتظار التجهيز';
        requested_status_updated_at := to_jsonb(now()::text);
      end if;

      merged_stores := merged_stores || jsonb_build_array(
        jsonb_set(
          jsonb_set(old_store,'{status}',to_jsonb(requested_status),true),
          '{status_updated_at}',requested_status_updated_at,true
        )
      );
    end loop;

    new_d := jsonb_set(new_d,'{stores}',merged_stores,true);
  elsif old_d->'store_id' is not null then
    -- V93 single-store compatibility.
    new_d := jsonb_set(new_d,'{store_id}',old_d->'store_id',true);
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
'V94-aware bundle guard: locks global status after payment, freezes items/store financial shares, permits only per-store operational status metadata.';


-- Vendor read projection. Deliberately omits orders.total_price, customer_total_local,
-- stores[] for other merchants and all non-matching item rows.
create or replace function public.meshwar_vendor_v94_orders(p_store_id uuid)
returns table(
  order_id uuid,
  order_code text,
  created_at timestamptz,
  store_name text,
  store_status text,
  store_subtotal numeric,
  currency text,
  items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with parsed as (
    select o.id,o.order_code,o.created_at,o.currency::text as currency,
           o.details::jsonb as d
      from public.orders o
     where o.status = 'تم التسديد'
       and o.details is not null
       and btrim(o.details::text) <> ''
  ), eligible as (
    select p.*,
           (
             select s
               from jsonb_array_elements(coalesce(p.d->'stores','[]'::jsonb)) s
              where s->>'store_id' = p_store_id::text
              limit 1
           ) as store_obj,
           (
             select coalesce(jsonb_agg(i order by ord),'[]'::jsonb)
               from jsonb_array_elements(coalesce(p.d->'items','[]'::jsonb)) with ordinality as x(i,ord)
              where i->>'store_id' = p_store_id::text
           ) as vendor_items
      from parsed p
     where coalesce(p.d->>'source','') = 'local_cart_bundle'
       and coalesce(p.d->>'bundle_version','') = 'v94-global-multistore'
  )
  select e.id,
         e.order_code,
         e.created_at,
         coalesce(e.store_obj->>'store_name','المتجر'),
         coalesce(nullif(e.store_obj->>'status',''),'بانتظار التجهيز'),
         case
           when coalesce(e.store_obj->>'subtotal_local','') ~ '^-?[0-9]+([.][0-9]+)?$'
             then (e.store_obj->>'subtotal_local')::numeric
           else coalesce((select sum(coalesce(nullif(i->>'line_total_local','')::numeric,0)) from jsonb_array_elements(e.vendor_items) i),0)
         end,
         coalesce(nullif(e.store_obj->>'currency',''),e.currency,'IQD'),
         e.vendor_items
    from eligible e
   where e.store_obj is not null
     and jsonb_typeof(e.vendor_items) = 'array'
     and jsonb_array_length(e.vendor_items) > 0
   order by e.created_at desc;
$$;

comment on function public.meshwar_vendor_v94_orders(uuid) is
'V94 vendor projection only: returns one store subtotal and matching items; never returns global totals or other stores.';


-- Independent post-payment store preparation status. It never changes orders.status.
create or replace function public.meshwar_vendor_v94_set_store_status(
  p_order_id uuid,
  p_store_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  d jsonb;
  stores jsonb;
  rebuilt jsonb := '[]'::jsonb;
  s jsonb;
  current_status text;
  current_idx integer;
  requested_idx integer;
  found_store boolean := false;
  allowed text[] := array['بانتظار التجهيز','قيد التجهيز','جاهز للتسليم للمندوب','تم التسليم للمندوب'];
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'تم التسديد' then raise exception 'Store preparation is available only after payment'; end if;

  begin d := o.details::jsonb; exception when others then raise exception 'Invalid order details'; end;
  if coalesce(d->>'source','') <> 'local_cart_bundle' or coalesce(d->>'bundle_version','') <> 'v94-global-multistore' then
    raise exception 'Order is not a V94 multi-store bundle';
  end if;
  if jsonb_typeof(d->'stores') <> 'array' then raise exception 'V94 stores contract is missing'; end if;

  requested_idx := array_position(allowed,p_status);
  if requested_idx is null then raise exception 'Unsupported store status'; end if;
  stores := d->'stores';

  for s in select value from jsonb_array_elements(stores)
  loop
    if s->>'store_id' = p_store_id::text then
      found_store := true;
      current_status := coalesce(nullif(s->>'status',''),'بانتظار التجهيز');
      current_idx := array_position(allowed,current_status);
      if current_idx is null then current_idx := 1; end if;
      if requested_idx < current_idx then raise exception 'Store status cannot move backwards'; end if;
      s := jsonb_set(s,'{status}',to_jsonb(p_status),true);
      s := jsonb_set(s,'{status_updated_at}',to_jsonb(now()::text),true);
    end if;
    rebuilt := rebuilt || jsonb_build_array(s);
  end loop;

  if not found_store then raise exception 'Store is not part of this order'; end if;
  d := jsonb_set(d,'{stores}',rebuilt,true);
  update public.orders set details = d::text where id = p_order_id;

  return jsonb_build_object('ok',true,'order_id',p_order_id,'store_id',p_store_id,'status',p_status);
end;
$$;

comment on function public.meshwar_vendor_v94_set_store_status(uuid,uuid,text) is
'V94 store lifecycle: advances one store preparation status after payment without changing the global order status or any financial field.';

grant execute on function public.meshwar_vendor_v94_orders(uuid) to anon, authenticated;
grant execute on function public.meshwar_vendor_v94_set_store_status(uuid,uuid,text) to anon, authenticated;
