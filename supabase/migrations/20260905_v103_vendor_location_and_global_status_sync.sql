-- KINTO V103 — vendor location projection and canonical realtime status sync.

begin;

-- Keep the V94 guard unchanged for legacy multi-store bundles. Independent
-- vendor orders get their own guard so operational status can be synchronized
-- without weakening immutable checkout snapshots.
do $$
begin
  if to_regprocedure('public.meshwar_local_cart_bundle_guard_v94_legacy()') is null then
    alter function public.meshwar_local_cart_bundle_guard()
      rename to meshwar_local_cart_bundle_guard_v94_legacy;
  end if;
end;
$$;

create or replace function public.meshwar_independent_vendor_order_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old jsonb := coalesce(nullif(old.details::text, '')::jsonb, '{}'::jsonb);
  v_new jsonb := coalesce(nullif(new.details::text, '')::jsonb, v_old);
  v_key text;
  v_immutable constant text[] := array[
    'source', 'checkout_contract', 'checkout_group_id', 'vendor_order_id',
    'items', 'stores', 'store_id', 'store_name', 'quantity',
    'requested_quantity', 'item_count', 'customer_scope_id',
    'customer_scope_type', 'submitted_at', 'customer_total_local',
    'store_subtotal', 'currency', 'shipping_snapshot'
  ];
begin
  foreach v_key in array v_immutable loop
    if v_old ? v_key then
      v_new := jsonb_set(v_new, array[v_key], v_old -> v_key, true);
    end if;
  end loop;
  new.details := v_new::text;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_guard on public.orders;
drop trigger if exists trg_meshwar_legacy_bundle_guard on public.orders;
drop trigger if exists trg_meshwar_independent_vendor_order_guard on public.orders;

create trigger trg_meshwar_legacy_bundle_guard
before update of status, details on public.orders
for each row
when (
  coalesce(
    private.v94_jsonb_object(to_jsonb(old.details))
      ->> 'checkout_contract',
    ''
  )
    is distinct from 'independent_vendor_orders'
)
execute function public.meshwar_local_cart_bundle_guard_v94_legacy();

create trigger trg_meshwar_independent_vendor_order_guard
before update of status, details on public.orders
for each row
when (
  coalesce(
    private.v94_jsonb_object(to_jsonb(old.details))
      ->> 'checkout_contract',
    ''
  )
    = 'independent_vendor_orders'
)
execute function public.meshwar_independent_vendor_order_guard();

drop function if exists public.vendor_list_order_segments(text, integer, integer);

create function public.vendor_list_order_segments(
  p_session_token text,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  segment_id uuid,
  order_id uuid,
  order_code text,
  reference_order_no text,
  order_created_at timestamptz,
  items_preview jsonb,
  quantity_total integer,
  subtotal_local numeric,
  currency text,
  store_status text,
  confirmed_at timestamptz,
  vendor_payment_status text,
  shipping_company_name text,
  delivery_fee numeric,
  delivery_currency text,
  shipping_snapshot jsonb,
  segment_updated_at timestamptz,
  customer_location jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
begin
  return query
  select
    s.id,
    s.order_id,
    coalesce(o.order_code::text, o.id::text),
    o.reference_order_no::text,
    o.created_at,
    s.items_snapshot,
    s.quantity_total,
    s.subtotal_local,
    s.currency,
    s.store_status,
    s.confirmed_at,
    s.vendor_payment_status,
    coalesce(
      nullif(o.shipping_company_name::text, ''),
      nullif(o.shipping_snapshot ->> 'company_name', ''),
      nullif(o.shipping_snapshot ->> 'provider', ''),
      nullif(v.details #>> '{shipping_snapshot,provider}', '')
    ),
    coalesce(
      nullif(private.v94_numeric(o.shipping_snapshot ->> 'delivery_fee', -1), -1),
      nullif(private.v94_numeric(o.shipping_snapshot ->> 'cost', -1), -1),
      nullif(private.v94_numeric(v.details #>> '{shipping_snapshot,cost}', -1), -1),
      o.delivery_fee,
      0
    )::numeric,
    coalesce(
      nullif(o.delivery_currency::text, ''),
      nullif(o.shipping_snapshot ->> 'currency', ''),
      s.currency
    ),
    coalesce(
      nullif(o.shipping_snapshot, '{}'::jsonb),
      private.v94_jsonb_object(v.details -> 'shipping_snapshot'),
      '{}'::jsonb
    ),
    s.updated_at,
    jsonb_strip_nulls(jsonb_build_object(
      'country', loc.country,
      'province', loc.province,
      'city', loc.city,
      'label', concat_ws(
        ' / ', loc.province, nullif(loc.city, loc.province)
      )
    ))
  from public.order_store_segments s
  join public.orders o on o.id = s.order_id
  cross join lateral (
    select private.v94_jsonb_object(to_jsonb(o.details)) as details
  ) v
  cross join lateral (
    select
      coalesce(
        nullif(trim(s.customer_snapshot ->> 'country'), ''),
        nullif(trim(v.details ->> 'country'), ''),
        nullif(trim(v.details #>> '{customer,country}'), '')
      ) as country,
      coalesce(
        nullif(trim(s.customer_snapshot ->> 'province'), ''),
        nullif(trim(s.customer_snapshot ->> 'governorate'), ''),
        nullif(trim(v.details ->> 'governorate'), ''),
        nullif(trim(v.details ->> 'province'), ''),
        nullif(trim(v.details #>> '{customer,province}'), ''),
        nullif(trim(v.details #>> '{customer,governorate}'), '')
      ) as province,
      coalesce(
        nullif(trim(s.customer_snapshot ->> 'city'), ''),
        nullif(trim(v.details ->> 'city'), ''),
        nullif(trim(v.details #>> '{customer,city}'), '')
      ) as city
  ) loc
  where s.store_id = v_store_id
    and s.payment_confirmed = true
  order by s.confirmed_at desc nulls last, s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function private.v103_sync_independent_order_status(
  p_order_id uuid,
  p_store_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_type text;
begin
  select c.udt_name into v_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'orders'
    and c.column_name = 'details';

  if v_type = 'jsonb' then
    execute $q$
      update public.orders
      set status = $2,
          details = jsonb_set(
            jsonb_set(
              jsonb_set(private.v94_jsonb_object(to_jsonb(details)),
                array['store_statuses', $3], to_jsonb($2::text), true),
              '{vendor_status}', to_jsonb($2::text), true),
            '{operational_status}', to_jsonb($2::text), true)
      where id = $1
    $q$ using p_order_id, p_status, p_store_id::text;
  elsif v_type = 'json' then
    execute $q$
      update public.orders
      set status = $2,
          details = jsonb_set(
            jsonb_set(
              jsonb_set(private.v94_jsonb_object(to_jsonb(details)),
                array['store_statuses', $3], to_jsonb($2::text), true),
              '{vendor_status}', to_jsonb($2::text), true),
            '{operational_status}', to_jsonb($2::text), true)::json
      where id = $1
    $q$ using p_order_id, p_status, p_store_id::text;
  else
    execute $q$
      update public.orders
      set status = $2,
          details = jsonb_set(
            jsonb_set(
              jsonb_set(private.v94_jsonb_object(to_jsonb(details)),
                array['store_statuses', $3], to_jsonb($2::text), true),
              '{vendor_status}', to_jsonb($2::text), true),
            '{operational_status}', to_jsonb($2::text), true)::text
      where id = $1
    $q$ using p_order_id, p_status, p_store_id::text;
  end if;
end;
$$;

create or replace function public.vendor_advance_order_segment_status(
  p_session_token text,
  p_segment_id uuid,
  p_expected_status text,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_segment public.order_store_segments%rowtype;
  v_contract text;
  v_allowed constant text[] := array[
    'مخزن الشركة', 'تجهيز شحن', 'محولة إلى الفرع', 'تم الشحن',
    'مخزن محلي', 'مندوب', 'توزيع داخلي', 'تم التسليم',
    'رفض التسليم', 'مرفوض'
  ];
begin
  select * into v_segment
  from public.order_store_segments s
  where s.id = p_segment_id
    and s.store_id = v_store_id
  for update;

  if v_segment.id is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_segment.payment_confirmed then
    raise exception 'ORDER_NOT_PAID' using errcode = 'P0001';
  end if;
  if v_segment.store_status is distinct from p_expected_status then
    raise exception 'ORDER_STATUS_CONFLICT:%', v_segment.store_status
      using errcode = '40001';
  end if;
  if nullif(trim(coalesce(p_next_status, '')), '') is null
     or not (p_next_status = any(v_allowed)) then
    raise exception 'ORDER_STATUS_TRANSITION_INVALID' using errcode = '22023';
  end if;

  select private.v94_jsonb_object(to_jsonb(o.details))
           ->> 'checkout_contract'
    into v_contract
  from public.orders o
  where o.id = v_segment.order_id
  for update;

  update public.order_store_segments
  set store_status = p_next_status,
      updated_at = now()
  where id = v_segment.id;

  if v_contract = 'independent_vendor_orders' then
    perform private.v103_sync_independent_order_status(
      v_segment.order_id, v_store_id, p_next_status
    );
  else
    perform private.mirror_v94_store_status(
      v_segment.order_id, v_store_id, p_next_status
    );
  end if;

  return jsonb_build_object(
    'segment_id', v_segment.id,
    'order_id', v_segment.order_id,
    'previous_status', v_segment.store_status,
    'store_status', p_next_status,
    'canonical_order_status',
      case when v_contract = 'independent_vendor_orders'
        then p_next_status else null end,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.vendor_list_order_segments(
  text, integer, integer
) from public;
revoke all on function public.vendor_advance_order_segment_status(
  text, uuid, text, text
) from public;
revoke all on function private.v103_sync_independent_order_status(
  uuid, uuid, text
) from public;
grant execute on function public.vendor_list_order_segments(
  text, integer, integer
) to anon, authenticated;
grant execute on function public.vendor_advance_order_segment_status(
  text, uuid, text, text
) to anon, authenticated;

comment on function public.vendor_advance_order_segment_status(
  text, uuid, text, text
) is
'V103 atomic vendor status transition: segment plus canonical independent order status for system-wide realtime consumers.';

notify pgrst, 'reload schema';
commit;
