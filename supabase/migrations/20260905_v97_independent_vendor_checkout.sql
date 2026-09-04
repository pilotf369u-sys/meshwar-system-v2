-- V97 phase 1: atomically split one cart into independent vendor orders.
-- Browser values are identifiers/options only; product prices and store pricing
-- are resolved again from the database inside this transaction.

begin;

create extension if not exists pgcrypto;

create or replace function public.checkout_independent_vendor_orders(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_checkout_group_id uuid := gen_random_uuid();
  v_customer jsonb := '{}'::jsonb;
  v_customer_name text;
  v_customer_phone text;
  v_store record;
  v_order public.orders%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_input_count integer;
  v_valid_count integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'CHECKOUT_ITEMS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  v_input_count := jsonb_array_length(p_items);
  if v_input_count < 1 or v_input_count > 100 then
    raise exception 'CHECKOUT_ITEM_COUNT_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) x(item)
    where private.v94_uuid(x.item ->> 'store_id') is null
       or private.v94_uuid(x.item ->> 'product_id') is null
       or private.v94_numeric(x.item ->> 'quantity', 0) <> trunc(private.v94_numeric(x.item ->> 'quantity', 0))
       or private.v94_numeric(x.item ->> 'quantity', 0) < 1
       or private.v94_numeric(x.item ->> 'quantity', 0) > 1000
  ) then
    raise exception 'CHECKOUT_ITEM_INVALID' using errcode = '22023';
  end if;

  select count(*)
    into v_valid_count
  from jsonb_array_elements(p_items) x(item)
  join public.local_products p
    on p.id = private.v94_uuid(x.item ->> 'product_id')
   and p.store_id = private.v94_uuid(x.item ->> 'store_id')
  join public.local_stores s
    on s.id = p.store_id
   and lower(coalesce(s.status, '')) = 'active'
  where coalesce(p.is_out_of_stock, false) = false
    and coalesce(p.discount_price, p.base_price) is not null
    and coalesce(p.discount_price, p.base_price) >= 0
    and coalesce(s.commission_rate, 10) >= 0
    and coalesce(s.commission_rate, 10) < 100
    and coalesce(s.exchange_rate, 0) > 0;

  if v_valid_count <> v_input_count then
    raise exception 'CHECKOUT_PRODUCT_OR_STORE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (
      select
        p.id,
        p.stock_quantity,
        sum(private.v94_numeric(x.item ->> 'quantity', 0)) as requested
      from jsonb_array_elements(p_items) x(item)
      join public.local_products p
        on p.id = private.v94_uuid(x.item ->> 'product_id')
       and p.store_id = private.v94_uuid(x.item ->> 'store_id')
      group by p.id, p.stock_quantity
    ) q
    where q.stock_quantity is not null and q.requested > q.stock_quantity
  ) then
    raise exception 'CHECKOUT_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  if p_customer_id is not null then
    select coalesce(to_jsonb(c), '{}'::jsonb)
      into v_customer
    from public.customers c
    where c.id = p_customer_id
    limit 1;

    if v_customer is null or v_customer = '{}'::jsonb then
      raise exception 'CHECKOUT_CUSTOMER_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  v_customer_name := coalesce(
    nullif(trim(v_customer ->> 'name'), ''),
    nullif(trim(p_customer_name), ''),
    'ضيف'
  );
  v_customer_phone := coalesce(
    nullif(trim(v_customer ->> 'phone'), ''),
    nullif(trim(p_customer_phone), ''),
    ''
  );

  for v_store in
    with priced as (
      select
        x.ordinality,
        s.id as store_id,
        s.store_name,
        coalesce(nullif(s.exchange_target_currency, ''), nullif(s.default_currency, ''), 'IQD') as currency,
        coalesce(s.commission_rate, 10)::numeric as commission_rate,
        s.exchange_rate::numeric as exchange_rate,
        p.id as product_id,
        p.product_name,
        p.image_url,
        p.options,
        private.v94_numeric(x.item ->> 'quantity', 1)::integer as quantity,
        coalesce(p.discount_price, p.base_price)::numeric as vendor_price,
        ceil(coalesce(p.discount_price, p.base_price)::numeric /
          (1 - coalesce(s.commission_rate, 10)::numeric / 100)) as customer_price_usd,
        ceil((ceil(coalesce(p.discount_price, p.base_price)::numeric /
          (1 - coalesce(s.commission_rate, 10)::numeric / 100)) * s.exchange_rate::numeric) / 1000) * 1000 as unit_price_local,
        coalesce(x.item -> 'selected_options', '{}'::jsonb) as selected_options
      from jsonb_array_elements(p_items) with ordinality x(item, ordinality)
      join public.local_products p
        on p.id = private.v94_uuid(x.item ->> 'product_id')
       and p.store_id = private.v94_uuid(x.item ->> 'store_id')
      join public.local_stores s on s.id = p.store_id
    )
    select
      store_id,
      max(store_name) as store_name,
      max(currency) as currency,
      count(*)::integer as item_count,
      sum(quantity)::integer as quantity_total,
      sum(unit_price_local * quantity)::numeric as subtotal_local,
      jsonb_agg(
        jsonb_build_object(
          'store_id', store_id,
          'store_name', store_name,
          'product_id', product_id,
          'product_name', product_name,
          'product_image', image_url,
          'selected_options', selected_options,
          'quantity', quantity,
          'unit_price_local', unit_price_local,
          'line_total_local', unit_price_local * quantity,
          'currency', currency,
          'pricing_snapshot', jsonb_build_object(
            'pricing_version', 'iqd_ceil_1000_v1',
            'vendor_price_usd', vendor_price,
            'customer_price_usd', customer_price_usd,
            'commission_rate', commission_rate,
            'exchange_rate', exchange_rate,
            'captured_at', now()
          )
        ) order by ordinality
      ) as items,
      (jsonb_agg(image_url order by ordinality) ->> 0) as first_image
    from priced
    group by store_id
    order by min(ordinality)
  loop
    insert into public.orders (
      customer_id,
      customer_name,
      customer_phone,
      total_price,
      currency,
      details,
      order_url,
      image_url,
      status
    ) values (
      p_customer_id,
      v_customer_name,
      v_customer_phone,
      v_store.subtotal_local,
      v_store.currency,
      jsonb_build_object(
        'source', 'local_cart_bundle',
        'bundle_version', 'v97-independent-vendor-order-1',
        'checkout_contract', 'independent_vendor_orders',
        'checkout_group_id', v_checkout_group_id,
        'multi_store', false,
        'store_id', v_store.store_id,
        'store_name', v_store.store_name,
        'customer_scope_id', coalesce(p_customer_id::text, 'guest'),
        'customer_scope_type', case when p_customer_id is null then 'guest' else 'customer' end,
        'items', v_store.items,
        'stores', jsonb_build_array(jsonb_build_object(
          'store_id', v_store.store_id,
          'store_name', v_store.store_name,
          'item_count', v_store.item_count,
          'quantity', v_store.quantity_total,
          'subtotal_local', v_store.subtotal_local,
          'currency', v_store.currency
        )),
        'store_statuses', jsonb_build_object(v_store.store_id::text, 'بانتظار التسديد'),
        'item_count', v_store.item_count,
        'quantity', v_store.quantity_total,
        'requested_quantity', v_store.quantity_total,
        'customer_total_local', v_store.subtotal_local,
        'local_currency', v_store.currency,
        'shipping_mode', 'vendor_managed_phase2',
        'delivery_fee_local', 0,
        'cancellation_policy', 'pre_payment_only',
        'submitted_at', now(),
        'bundle_locked', true
      ),
      'customer-dashboard.html',
      v_store.first_image,
      'انتظار رد الموظف'
    )
    returning * into v_order;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_order.id,
      'order_code', v_order.order_code,
      'store_id', v_store.store_id,
      'store_name', v_store.store_name,
      'total_price', v_store.subtotal_local,
      'currency', v_store.currency,
      'status', v_order.status
    ));
  end loop;

  return jsonb_build_object(
    'checkout_group_id', v_checkout_group_id,
    'order_count', jsonb_array_length(v_result),
    'orders', v_result
  );
end;
$$;

revoke all on function public.checkout_independent_vendor_orders(uuid, text, text, jsonb) from public;
grant execute on function public.checkout_independent_vendor_orders(uuid, text, text, jsonb) to anon, authenticated;

comment on function public.checkout_independent_vendor_orders(uuid, text, text, jsonb) is
'V97 phase 1: atomically creates one independently numbered order per store and calculates canonical prices server-side.';

notify pgrst, 'reload schema';

commit;
