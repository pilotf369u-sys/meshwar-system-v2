-- KINTO V105 — vendor-assigned shipping is the single source of truth.
-- New independent orders start with shipping pending. The vendor then selects
-- and confirms the company/fee through the V104 atomic RPC.

begin;

create or replace function private.v98_apply_vendor_shipping()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_details jsonb := private.v94_jsonb_object(to_jsonb(new.details));
  v_currency text := upper(coalesce(nullif(new.currency::text, ''), 'IQD'));
  v_pending jsonb := jsonb_build_object(
    'profile_active', true,
    'matched', false,
    'mode', 'vendor_assignment_pending',
    'assigned', false,
    'delivery_fee', 0,
    'cost', 0,
    'currency', upper(coalesce(nullif(new.currency::text, ''), 'IQD')),
    'created_at', now()
  );
begin
  if coalesce(v_details ->> 'checkout_contract', '')
     <> 'independent_vendor_orders' then
    return new;
  end if;

  -- Checkout no longer chooses or exposes a company/rate. The immutable goods
  -- total remains available while shipping is explicitly pending vendor input.
  new.delivery_fee := 0;
  new.delivery_currency := v_currency;
  new.shipping_company_name := null;
  new.shipping_snapshot := v_pending;
  new.shipping_version := 0;
  new.details := (v_details || jsonb_build_object(
    'shipping_mode', 'vendor_assignment_pending',
    'shipping_assigned', false,
    'delivery_fee', 0,
    'delivery_fee_local', 0,
    'delivery_currency', v_currency,
    'shipping_company_name', null,
    'shipping_snapshot', v_pending,
    'grand_total_local', private.v94_numeric(
      v_details ->> 'customer_total_local', new.total_price
    ),
    'grand_total_components', jsonb_build_array(
      jsonb_build_object(
        'kind', 'goods',
        'amount', private.v94_numeric(
          v_details ->> 'customer_total_local', new.total_price
        ),
        'currency', v_currency
      )
    )
  ))::text;
  return new;
end;
$$;

create or replace function public.vendor_list_order_shipping_controls(
  p_session_token text,
  p_segment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_result jsonb;
begin
  if coalesce(array_length(p_segment_ids, 1), 0) > 200 then
    raise exception 'ORDER_SEGMENT_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(
    s.id::text,
    public.vendor_get_order_shipping_control(p_session_token, s.id)
  ), '{}'::jsonb)
  into v_result
  from public.order_store_segments s
  where s.store_id = v_store_id
    and s.payment_confirmed = true
    and s.id = any(coalesce(p_segment_ids, array[]::uuid[]));

  return v_result;
end;
$$;

revoke all on function public.vendor_list_order_shipping_controls(
  text, uuid[]
) from public;
grant execute on function public.vendor_list_order_shipping_controls(
  text, uuid[]
) to anon, authenticated;

comment on function private.v98_apply_vendor_shipping() is
'V105 checkout policy: independent orders expose no shipping company or fee until the owning vendor confirms them.';
comment on function public.vendor_list_order_shipping_controls(text, uuid[]) is
'V105 secure batch projection for direct per-row shipping controls.';

notify pgrst, 'reload schema';
commit;
