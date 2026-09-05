-- KINTO V104 — atomic per-order vendor shipping control.
-- Keeps checkout matching as the default, while allowing the owning vendor to
-- select an active company/rate, override the fee, or grant free shipping.

begin;

alter table public.orders
  add column if not exists shipping_version bigint not null default 0;

create or replace function public.vendor_get_order_shipping_control(
  p_session_token text,
  p_segment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_segment public.order_store_segments%rowtype;
  v_order public.orders%rowtype;
  v_customer jsonb := '{}'::jsonb;
  v_options jsonb := '[]'::jsonb;
begin
  select * into v_segment
  from public.order_store_segments s
  where s.id = p_segment_id
    and s.store_id = v_store_id
    and s.payment_confirmed = true;

  if v_segment.id is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.orders o
  where o.id = v_segment.order_id;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_customer := coalesce(v_segment.customer_snapshot, '{}'::jsonb);

  select coalesce(jsonb_agg(option_row.payload order by option_row.sort_order,
    option_row.company_name), '[]'::jsonb)
  into v_options
  from (
    select
      c.sort_order,
      c.company_name,
      jsonb_strip_nulls(jsonb_build_object(
        'company_id', c.id,
        'company_name', c.company_name,
        'phone', c.phone,
        'tracking_url', c.tracking_url,
        'rate_id', rate.id,
        'delivery_fee', rate.delivery_fee,
        'currency', rate.currency,
        'estimated_days_min', rate.estimated_days_min,
        'estimated_days_max', rate.estimated_days_max,
        'scope', case when rate.id is null then null else jsonb_build_object(
          'country', rate.destination_country,
          'governorate', rate.governorate,
          'area', rate.area
        ) end,
        'match_mode', case
          when rate.id is null then 'no_rate'
          when private.v101_location_key(rate.governorate) =
               private.v101_location_key(coalesce(
                 v_customer ->> 'governorate', v_customer ->> 'province',
                 v_customer ->> 'city', ''
               )) then 'destination'
          else 'vendor_fallback'
        end
      )) as payload
    from public.vendor_shipping_companies c
    left join lateral (
      select r.*
      from public.vendor_shipping_rates r
      where r.store_id = v_store_id
        and r.company_id = c.id
        and r.is_active = true
      order by
        (private.v101_location_key(r.destination_country) =
          private.v101_location_key(coalesce(
            v_customer ->> 'country', v_customer ->> 'country_name', ''
          ))) desc,
        (private.v101_location_key(r.destination_country) = '*') desc,
        (private.v101_location_key(r.governorate) =
          private.v101_location_key(coalesce(
            v_customer ->> 'governorate', v_customer ->> 'province',
            v_customer ->> 'city', ''
          ))) desc,
        (private.v101_location_key(r.governorate) = '*') desc,
        (private.v101_location_key(r.area) =
          private.v101_location_key(coalesce(
            v_customer ->> 'area', v_customer ->> 'district',
            v_customer ->> 'neighborhood', ''
          ))) desc,
        (private.v101_location_key(r.area) = '*') desc,
        r.priority desc,
        r.updated_at desc
      limit 1
    ) rate on true
    where c.store_id = v_store_id
      and c.is_active = true
  ) option_row;

  return jsonb_build_object(
    'segment_id', v_segment.id,
    'order_id', v_order.id,
    'shipping_version', v_order.shipping_version,
    'shipping_company_name', v_order.shipping_company_name,
    'delivery_fee', coalesce(v_order.delivery_fee, 0),
    'delivery_currency', coalesce(
      v_order.delivery_currency,
      v_order.shipping_snapshot ->> 'currency',
      v_order.currency
    ),
    'free_shipping', coalesce(
      (v_order.shipping_snapshot ->> 'free_shipping')::boolean,
      false
    ),
    'shipping_snapshot', coalesce(v_order.shipping_snapshot, '{}'::jsonb),
    'goods_subtotal', v_segment.subtotal_local,
    'options', v_options
  );
end;
$$;

create or replace function public.vendor_update_order_shipping(
  p_session_token text,
  p_segment_id uuid,
  p_expected_version bigint,
  p_company_id uuid,
  p_rate_id uuid,
  p_delivery_fee numeric,
  p_currency text,
  p_free_shipping boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_segment public.order_store_segments%rowtype;
  v_order public.orders%rowtype;
  v_company public.vendor_shipping_companies%rowtype;
  v_rate public.vendor_shipping_rates%rowtype;
  v_contract text;
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_fee numeric := case when coalesce(p_free_shipping, false)
    then 0 else p_delivery_fee end;
  v_snapshot jsonb;
  v_details jsonb;
  v_details_type text;
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

  select * into v_order
  from public.orders o
  where o.id = v_segment.order_id
  for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.shipping_version <> coalesce(p_expected_version, -1) then
    raise exception 'ORDER_SHIPPING_VERSION_CONFLICT:%', v_order.shipping_version
      using errcode = '40001';
  end if;

  v_details := private.v94_jsonb_object(to_jsonb(v_order.details));
  v_contract := v_details ->> 'checkout_contract';
  if v_contract is distinct from 'independent_vendor_orders' then
    raise exception 'INDEPENDENT_VENDOR_ORDER_REQUIRED' using errcode = '22023';
  end if;

  select * into v_company
  from public.vendor_shipping_companies c
  where c.id = p_company_id
    and c.store_id = v_store_id
    and c.is_active = true;

  if v_company.id is null then
    raise exception 'SHIPPING_COMPANY_NOT_AVAILABLE' using errcode = '22023';
  end if;

  if p_rate_id is not null then
    select * into v_rate
    from public.vendor_shipping_rates r
    where r.id = p_rate_id
      and r.company_id = v_company.id
      and r.store_id = v_store_id
      and r.is_active = true;
    if v_rate.id is null then
      raise exception 'SHIPPING_RATE_NOT_AVAILABLE' using errcode = '22023';
    end if;
  end if;

  if v_fee is null or v_fee < 0 or v_fee > 999999999999 then
    raise exception 'SHIPPING_FEE_INVALID' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3,5}$' then
    raise exception 'SHIPPING_CURRENCY_INVALID' using errcode = '22023';
  end if;

  v_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'profile_active', true,
    'matched', p_rate_id is not null,
    'mode', case when coalesce(p_free_shipping, false)
      then 'vendor_free_shipping' else 'vendor_manual_selection' end,
    'manual_override', true,
    'free_shipping', coalesce(p_free_shipping, false),
    'company_id', v_company.id,
    'company_name', v_company.company_name,
    'provider', v_company.company_name,
    'company_phone', v_company.phone,
    'tracking_url', v_company.tracking_url,
    'rate_id', v_rate.id,
    'base_delivery_fee', v_rate.delivery_fee,
    'base_currency', v_rate.currency,
    'delivery_fee', v_fee,
    'cost', v_fee,
    'currency', v_currency,
    'estimated_days_min', v_rate.estimated_days_min,
    'estimated_days_max', v_rate.estimated_days_max,
    'scope', case when v_rate.id is null then null else jsonb_build_object(
      'country', v_rate.destination_country,
      'governorate', v_rate.governorate,
      'area', v_rate.area
    ) end,
    'selected_at', now(),
    'selected_by', 'vendor'
  ));

  v_details := jsonb_set(v_details, '{delivery_fee}', to_jsonb(v_fee), true);
  v_details := jsonb_set(v_details, '{delivery_currency}', to_jsonb(v_currency), true);
  v_details := jsonb_set(v_details, '{shipping_override}', v_snapshot, true);
  v_details := jsonb_set(v_details, '{grand_total_components}', jsonb_build_array(
    jsonb_build_object('type', 'goods', 'amount', v_segment.subtotal_local,
      'currency', v_segment.currency),
    jsonb_build_object('type', 'shipping', 'amount', v_fee,
      'currency', v_currency)
  ), true);
  if upper(v_currency) = upper(v_segment.currency) then
    v_details := jsonb_set(v_details, '{grand_total_local}',
      to_jsonb(v_segment.subtotal_local + v_fee), true);
  else
    v_details := v_details - 'grand_total_local';
  end if;

  select c.udt_name into v_details_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'orders'
    and c.column_name = 'details';

  if v_details_type = 'jsonb' then
    execute $q$
      update public.orders
      set shipping_company_name = $2,
          delivery_fee = $3,
          delivery_currency = $4,
          shipping_snapshot = $5,
          shipping_version = shipping_version + 1,
          details = $6
      where id = $1
    $q$ using v_order.id, v_company.company_name, v_fee, v_currency,
      v_snapshot, v_details;
  elsif v_details_type = 'json' then
    execute $q$
      update public.orders
      set shipping_company_name = $2,
          delivery_fee = $3,
          delivery_currency = $4,
          shipping_snapshot = $5,
          shipping_version = shipping_version + 1,
          details = $6::json
      where id = $1
    $q$ using v_order.id, v_company.company_name, v_fee, v_currency,
      v_snapshot, v_details;
  else
    execute $q$
      update public.orders
      set shipping_company_name = $2,
          delivery_fee = $3,
          delivery_currency = $4,
          shipping_snapshot = $5,
          shipping_version = shipping_version + 1,
          details = $6::text
      where id = $1
    $q$ using v_order.id, v_company.company_name, v_fee, v_currency,
      v_snapshot, v_details;
  end if;

  -- Touching the segment emits the existing realtime event consumed by the
  -- vendor table, while the canonical orders update reaches all other panels.
  update public.order_store_segments
  set updated_at = now()
  where id = v_segment.id;

  return public.vendor_get_order_shipping_control(
    p_session_token, p_segment_id
  );
end;
$$;

revoke all on function public.vendor_get_order_shipping_control(
  text, uuid
) from public;
revoke all on function public.vendor_update_order_shipping(
  text, uuid, bigint, uuid, uuid, numeric, text, boolean
) from public;
grant execute on function public.vendor_get_order_shipping_control(
  text, uuid
) to anon, authenticated;
grant execute on function public.vendor_update_order_shipping(
  text, uuid, bigint, uuid, uuid, numeric, text, boolean
) to anon, authenticated;

comment on function public.vendor_update_order_shipping(
  text, uuid, bigint, uuid, uuid, numeric, text, boolean
) is
'V104 atomic vendor-owned per-order shipping selection with free/manual override and optimistic version lock.';

notify pgrst, 'reload schema';
commit;
