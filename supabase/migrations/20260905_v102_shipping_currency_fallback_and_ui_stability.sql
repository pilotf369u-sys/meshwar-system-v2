-- KINTO V102 — last-resort cross-currency shipping snapshot.
-- Same-currency exact/default rates still win through V101. If none exists,
-- preserve the nearest active rate in its own currency instead of writing zero.

begin;

create or replace function private.v102_resolve_shipping_quote(
  p_store_id uuid,
  p_customer jsonb,
  p_order_currency text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_quote jsonb;
  v_country text := private.v101_location_key(coalesce(
    p_customer ->> 'country',
    p_customer ->> 'country_name',
    p_customer ->> 'country_code',
    ''
  ));
  v_governorate text := private.v101_location_key(coalesce(
    p_customer ->> 'governorate',
    p_customer ->> 'state',
    p_customer ->> 'province',
    p_customer ->> 'city',
    ''
  ));
  v_area text := private.v101_location_key(coalesce(
    p_customer ->> 'area',
    p_customer ->> 'district',
    p_customer ->> 'neighborhood',
    ''
  ));
  v_match record;
  v_mode text := 'cross_currency_exact';
begin
  v_quote := private.v98_resolve_shipping_quote(
    p_store_id,
    p_customer,
    p_order_currency
  );

  if coalesce((v_quote ->> 'matched')::boolean, false)
     or not coalesce((v_quote ->> 'profile_active')::boolean, false) then
    return v_quote;
  end if;

  select
    r.id as rate_id,
    r.delivery_fee,
    r.currency,
    r.destination_country,
    r.governorate,
    r.area,
    r.estimated_days_min,
    r.estimated_days_max,
    c.id as company_id,
    c.company_name,
    c.phone,
    c.tracking_url
  into v_match
  from public.vendor_shipping_rates r
  join public.vendor_shipping_companies c
    on c.id = r.company_id
   and c.store_id = r.store_id
   and c.is_active
  where r.store_id = p_store_id
    and r.is_active
    and (
      private.v101_location_key(r.destination_country) = '*'
      or private.v101_location_key(r.destination_country) = v_country
    )
    and (
      private.v101_location_key(r.governorate) = '*'
      or private.v101_location_key(r.governorate) = v_governorate
    )
    and (
      private.v101_location_key(r.area) = '*'
      or (v_area <> '' and private.v101_location_key(r.area) = v_area)
    )
  order by
    (private.v101_location_key(r.area) <> '*') desc,
    (private.v101_location_key(r.governorate) <> '*') desc,
    (private.v101_location_key(r.destination_country) <> '*') desc,
    r.priority desc,
    r.updated_at desc
  limit 1;

  if v_match.rate_id is null then
    v_mode := 'cross_currency_default';
    select
      r.id as rate_id,
      r.delivery_fee,
      r.currency,
      r.destination_country,
      r.governorate,
      r.area,
      r.estimated_days_min,
      r.estimated_days_max,
      c.id as company_id,
      c.company_name,
      c.phone,
      c.tracking_url
    into v_match
    from public.vendor_shipping_rates r
    join public.vendor_shipping_companies c
      on c.id = r.company_id
     and c.store_id = r.store_id
     and c.is_active
    where r.store_id = p_store_id
      and r.is_active
    order by
      (v_country <> '' and private.v101_location_key(r.destination_country) = v_country) desc,
      (private.v101_location_key(r.destination_country) = '*') desc,
      r.priority desc,
      r.updated_at desc
    limit 1;
  end if;

  if v_match.rate_id is null then return v_quote; end if;

  return jsonb_build_object(
    'profile_active', true,
    'matched', true,
    'mode', v_mode,
    'mixed_currency', upper(v_match.currency) <> upper(coalesce(p_order_currency, '')),
    'order_currency', upper(coalesce(p_order_currency, '')),
    'rate_id', v_match.rate_id,
    'company_id', v_match.company_id,
    'company_name', v_match.company_name,
    'provider', v_match.company_name,
    'company_phone', v_match.phone,
    'tracking_url', v_match.tracking_url,
    'delivery_fee', v_match.delivery_fee,
    'cost', v_match.delivery_fee,
    'currency', v_match.currency,
    'estimated_days_min', v_match.estimated_days_min,
    'estimated_days_max', v_match.estimated_days_max,
    'scope', jsonb_build_object(
      'country', v_match.destination_country,
      'governorate', v_match.governorate,
      'area', v_match.area
    ),
    'destination', jsonb_build_object(
      'country', v_country,
      'governorate', v_governorate,
      'area', v_area
    ),
    'quoted_at', now()
  );
end;
$$;

create or replace function private.v98_apply_vendor_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_details jsonb := private.v94_jsonb_object(to_jsonb(new.details));
  v_client_customer jsonb := private.v94_jsonb_object(to_jsonb(
    current_setting('app.checkout_customer_shipping', true)
  ));
  v_customer jsonb := '{}'::jsonb;
  v_quote jsonb;
  v_store_id uuid;
  v_fee numeric := 0;
  v_currency text;
  v_mixed_currency boolean := false;
begin
  if coalesce(v_details ->> 'checkout_contract', '')
     <> 'independent_vendor_orders' then
    return new;
  end if;

  v_store_id := private.v94_uuid(v_details ->> 'store_id');
  if v_store_id is null then
    raise exception 'INDEPENDENT_ORDER_STORE_MISSING'
      using errcode = '22023';
  end if;

  if new.customer_id is not null then
    select coalesce(to_jsonb(c), '{}'::jsonb)
    into v_customer
    from public.customers c
    where c.id::text = new.customer_id::text
    limit 1;
  end if;

  v_customer := coalesce(v_client_customer, '{}'::jsonb)
    || coalesce(v_customer, '{}'::jsonb);

  v_quote := private.v102_resolve_shipping_quote(
    v_store_id,
    v_customer,
    new.currency::text
  );

  if coalesce((v_quote ->> 'profile_active')::boolean, false)
     and not coalesce((v_quote ->> 'matched')::boolean, false) then
    raise exception 'SHIPPING_RATE_NOT_CONFIGURED'
      using errcode = 'P0001';
  end if;

  v_fee := private.v94_numeric(v_quote ->> 'delivery_fee', 0);
  v_currency := upper(coalesce(
    nullif(v_quote ->> 'currency', ''),
    new.currency,
    'IQD'
  ));
  v_mixed_currency := v_currency <> upper(coalesce(new.currency, ''));

  new.delivery_fee := v_fee;
  new.delivery_currency := v_currency;
  new.shipping_company_name := nullif(v_quote ->> 'company_name', '');
  new.shipping_snapshot := v_quote;
  new.details := (v_details || jsonb_build_object(
    'shipping_mode', v_quote ->> 'mode',
    'shipping_mixed_currency', v_mixed_currency,
    'delivery_fee', v_fee,
    'delivery_fee_local', case when v_mixed_currency then 0 else v_fee end,
    'delivery_currency', v_currency,
    'shipping_company_name', new.shipping_company_name,
    'shipping_snapshot', v_quote,
    'grand_total_local',
      private.v94_numeric(
        v_details ->> 'customer_total_local',
        new.total_price
      ) + case when v_mixed_currency then 0 else v_fee end,
    'grand_total_components', jsonb_build_array(
      jsonb_build_object(
        'kind', 'goods',
        'amount', private.v94_numeric(
          v_details ->> 'customer_total_local',
          new.total_price
        ),
        'currency', new.currency
      ),
      jsonb_build_object(
        'kind', 'delivery',
        'amount', v_fee,
        'currency', v_currency
      )
    )
  ))::text;

  return new;
end;
$$;

comment on function private.v102_resolve_shipping_quote(uuid, jsonb, text) is
'V102 shipping resolver: same-currency V101 matching first, then nearest active cross-currency snapshot without unsafe currency addition.';

notify pgrst, 'reload schema';

commit;
