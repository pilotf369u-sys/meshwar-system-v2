-- KINTO V101 — carry checkout destination and always resolve a configured rate.
-- Exact destination matching wins; otherwise the best active same-currency rate
-- becomes the store fallback. Existing orders are not rewritten.

begin;

create or replace function private.v101_location_key(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_value, '')));
begin
  if v = '*' then return '*'; end if;
  v := trim(both '*' from v);
  v := replace(replace(replace(replace(v, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ٱ', 'ا');
  v := replace(replace(replace(replace(v, 'ى', 'ي'), 'ة', 'ه'), 'ؤ', 'و'), 'ئ', 'ي');
  v := regexp_replace(v, '[ًٌٍَُِّْـ]', '', 'g');
  return regexp_replace(v, '[[:space:]_\-،,./]+', '', 'g');
end;
$$;

create or replace function private.v98_resolve_shipping_quote(
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
  v_profile public.vendor_shipping_profiles%rowtype;
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
  v_currency text := upper(trim(coalesce(p_order_currency, '')));
  v_match record;
  v_mode text := 'exact';
  v_has_rates boolean := false;
begin
  select * into v_profile
  from public.vendor_shipping_profiles
  where store_id = p_store_id;

  select exists (
    select 1
    from public.vendor_shipping_rates r
    join public.vendor_shipping_companies c
      on c.id = r.company_id
     and c.store_id = r.store_id
     and c.is_active
    where r.store_id = p_store_id
      and r.is_active
  ) into v_has_rates;

  if not v_has_rates then
    return jsonb_build_object(
      'profile_active', false,
      'matched', false,
      'delivery_fee', 0,
      'currency', coalesce(nullif(v_currency, ''), v_profile.default_currency, 'IQD'),
      'mode', 'unconfigured'
    );
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
    and (v_currency = '' or upper(r.currency) = v_currency)
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
    v_mode := 'default_fallback';
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
      and (v_currency = '' or upper(r.currency) = v_currency)
    order by
      (v_country <> '' and private.v101_location_key(r.destination_country) = v_country) desc,
      (private.v101_location_key(r.destination_country) = '*') desc,
      (private.v101_location_key(r.governorate) = '*') desc,
      (private.v101_location_key(r.area) = '*') desc,
      r.priority desc,
      r.updated_at desc
    limit 1;
  end if;

  if v_match.rate_id is null then
    return jsonb_build_object(
      'profile_active', true,
      'matched', false,
      'delivery_fee', 0,
      'currency', coalesce(nullif(v_currency, ''), v_profile.default_currency, 'IQD'),
      'mode', 'no_same_currency_rate',
      'destination', jsonb_build_object(
        'country', v_country,
        'governorate', v_governorate,
        'area', v_area
      )
    );
  end if;

  return jsonb_build_object(
    'profile_active', true,
    'matched', true,
    'mode', v_mode,
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
    'quoted_at', now(),
    'profile_version', v_profile.version
  );
end;
$$;

create or replace function private.v98_resolve_shipping_quote(
  p_store_id uuid,
  p_customer jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.v98_resolve_shipping_quote(p_store_id, p_customer, null);
$$;

create or replace function public.checkout_independent_vendor_orders_v101(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_shipping jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if jsonb_typeof(coalesce(p_customer_shipping, '{}'::jsonb)) <> 'object' then
    raise exception 'CHECKOUT_SHIPPING_DESTINATION_INVALID'
      using errcode = '22023';
  end if;

  perform set_config(
    'app.checkout_customer_shipping',
    coalesce(p_customer_shipping, '{}'::jsonb)::text,
    true
  );

  return public.checkout_independent_vendor_orders(
    p_customer_id,
    p_customer_name,
    p_customer_phone,
    p_items
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

  -- Canonical database fields win; checkout payload only fills missing fields.
  v_customer := coalesce(v_client_customer, '{}'::jsonb)
    || coalesce(v_customer, '{}'::jsonb);

  v_quote := private.v98_resolve_shipping_quote(
    v_store_id,
    v_customer,
    new.currency::text
  );

  if coalesce((v_quote ->> 'profile_active')::boolean, false)
     and not coalesce((v_quote ->> 'matched')::boolean, false) then
    raise exception 'SHIPPING_RATE_NOT_CONFIGURED_FOR_ORDER_CURRENCY'
      using errcode = 'P0001';
  end if;

  v_fee := private.v94_numeric(v_quote ->> 'delivery_fee', 0);
  v_currency := upper(coalesce(
    nullif(v_quote ->> 'currency', ''),
    new.currency,
    'IQD'
  ));

  if upper(coalesce(new.currency, '')) <> v_currency then
    raise exception 'SHIPPING_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  new.delivery_fee := v_fee;
  new.delivery_currency := v_currency;
  new.shipping_company_name := nullif(v_quote ->> 'company_name', '');
  new.shipping_snapshot := v_quote;
  new.details := (v_details || jsonb_build_object(
    'shipping_mode', v_quote ->> 'mode',
    'shipping_destination', jsonb_build_object(
      'country', v_customer ->> 'country',
      'governorate', coalesce(
        v_customer ->> 'governorate',
        v_customer ->> 'state',
        v_customer ->> 'province',
        v_customer ->> 'city'
      ),
      'city', v_customer ->> 'city',
      'area', coalesce(
        v_customer ->> 'area',
        v_customer ->> 'district',
        v_customer ->> 'neighborhood'
      )
    ),
    'delivery_fee', v_fee,
    'delivery_fee_local', v_fee,
    'delivery_currency', v_currency,
    'shipping_company_name', new.shipping_company_name,
    'shipping_snapshot', v_quote,
    'grand_total_local',
      private.v94_numeric(
        v_details ->> 'customer_total_local',
        new.total_price
      ) + v_fee
  ))::text;

  return new;
end;
$$;

revoke all on function public.checkout_independent_vendor_orders_v101(
  uuid,
  text,
  text,
  jsonb,
  jsonb
) from public;

grant execute on function public.checkout_independent_vendor_orders_v101(
  uuid,
  text,
  text,
  jsonb,
  jsonb
) to anon, authenticated;

comment on function public.checkout_independent_vendor_orders_v101(
  uuid,
  text,
  text,
  jsonb,
  jsonb
) is
'V101 checkout adapter: carries customer destination, then delegates atomic independent order creation to V97.';

notify pgrst, 'reload schema';

commit;
