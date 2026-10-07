-- KINTO V98 hotfix — make vendor shipping compatible with orders.details TEXT.
-- Safe to run after 20260905_v98_vendor_shipping_settings.sql.

begin;

create or replace function private.v98_apply_vendor_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_details jsonb := private.v94_jsonb_object(to_jsonb(new.details));
  v_customer jsonb := '{}'::jsonb;
  v_quote jsonb;
  v_store_id uuid;
  v_fee numeric := 0;
  v_currency text;
begin
  if coalesce(v_details ->> 'checkout_contract', '') <> 'independent_vendor_orders' then
    return new;
  end if;

  v_store_id := private.v94_uuid(v_details ->> 'store_id');
  if v_store_id is null then
    raise exception 'INDEPENDENT_ORDER_STORE_MISSING' using errcode = '22023';
  end if;

  if new.customer_id is not null then
    select coalesce(to_jsonb(c), '{}'::jsonb) into v_customer
    from public.customers c
    where c.id::text = new.customer_id::text
    limit 1;
  end if;

  v_quote := private.v98_resolve_shipping_quote(
    v_store_id,
    coalesce(v_customer, '{}'::jsonb)
  );

  if coalesce((v_quote ->> 'profile_active')::boolean, false)
     and not coalesce((v_quote ->> 'matched')::boolean, false) then
    raise exception 'SHIPPING_DESTINATION_UNSUPPORTED' using errcode = 'P0001';
  end if;

  v_fee := private.v94_numeric(v_quote ->> 'delivery_fee', 0);
  v_currency := upper(coalesce(
    nullif(v_quote ->> 'currency', ''),
    new.currency,
    'IQD'
  ));

  if v_fee > 0 and upper(coalesce(new.currency, '')) <> v_currency then
    raise exception 'SHIPPING_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  new.delivery_fee := v_fee;
  new.delivery_currency := v_currency;
  new.shipping_company_name := nullif(v_quote ->> 'company_name', '');
  new.shipping_snapshot := v_quote;
  new.details := (v_details || jsonb_build_object(
    'shipping_mode', case
      when coalesce((v_quote ->> 'matched')::boolean, false)
        then 'vendor_rate_snapshot'
      else 'unconfigured'
    end,
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

comment on function private.v98_apply_vendor_shipping() is
'V98 shipping snapshot trigger; explicitly adapts orders.details TEXT through to_jsonb before V94 parsing.';

notify pgrst, 'reload schema';

commit;
