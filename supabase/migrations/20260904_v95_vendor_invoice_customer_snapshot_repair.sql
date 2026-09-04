-- V95 vendor invoice customer repair
-- Reads the immutable segment snapshot first, then safely fills missing legacy fields.

begin;

create or replace function public.vendor_get_order_segment_details(
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
  v_order jsonb;
  v_details jsonb := '{}'::jsonb;
  v_snapshot jsonb := '{}'::jsonb;
  v_customer_row jsonb := '{}'::jsonb;
  v_customer jsonb := '{}'::jsonb;
begin
  select s.*
  into v_segment
  from public.order_store_segments s
  where s.id = p_segment_id
    and s.store_id = v_store_id
    and s.payment_confirmed = true;

  if v_segment.id is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select to_jsonb(o)
  into v_order
  from public.orders o
  where o.id = v_segment.order_id;

  if v_order is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_details := private.v94_jsonb_object(v_order -> 'details');
  v_snapshot := private.v94_jsonb_object(v_segment.customer_snapshot);

  if coalesce(v_order ->> 'customer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select coalesce(to_jsonb(c), '{}'::jsonb)
    into v_customer_row
    from public.customers c
    where c.id = (v_order ->> 'customer_id')::uuid
    limit 1;
    v_customer_row := coalesce(v_customer_row, '{}'::jsonb);
  end if;

  v_customer := jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(
      nullif(trim(v_snapshot ->> 'name'), ''),
      nullif(trim(v_snapshot ->> 'customer_name'), ''),
      nullif(trim(v_order ->> 'customer_name'), ''),
      nullif(trim(v_details ->> 'customer_name'), ''),
      nullif(trim(v_details #>> '{customer,name}'), ''),
      nullif(trim(v_customer_row ->> 'name'), '')
    ),
    'code', coalesce(
      nullif(trim(v_snapshot ->> 'code'), ''),
      nullif(trim(v_snapshot ->> 'customer_code'), ''),
      nullif(trim(v_order ->> 'customer_code'), ''),
      nullif(trim(v_details ->> 'customer_code'), ''),
      nullif(trim(v_details #>> '{customer,code}'), ''),
      nullif(trim(v_customer_row ->> 'code'), ''),
      nullif(trim(v_customer_row ->> 'customer_code'), '')
    ),
    'phone', coalesce(
      nullif(trim(v_snapshot ->> 'phone'), ''),
      nullif(trim(v_snapshot ->> 'customer_phone'), ''),
      nullif(trim(v_order ->> 'customer_phone'), ''),
      nullif(trim(v_details ->> 'customer_phone'), ''),
      nullif(trim(v_details #>> '{customer,phone}'), ''),
      nullif(trim(v_customer_row ->> 'phone'), '')
    ),
    'secondary_phone', coalesce(
      nullif(trim(v_snapshot ->> 'secondary_phone'), ''),
      nullif(trim(v_snapshot ->> 'phone2'), ''),
      nullif(trim(v_order ->> 'secondary_phone'), ''),
      nullif(trim(v_details ->> 'secondary_phone'), ''),
      nullif(trim(v_details ->> 'customer_secondary_phone'), ''),
      nullif(trim(v_customer_row ->> 'secondary_phone'), ''),
      nullif(trim(v_customer_row ->> 'phone2'), '')
    ),
    'country', coalesce(
      nullif(trim(v_snapshot ->> 'country'), ''),
      nullif(trim(v_order ->> 'country'), ''),
      nullif(trim(v_details ->> 'country'), ''),
      nullif(trim(v_details ->> 'customer_country'), ''),
      nullif(trim(v_customer_row ->> 'country'), '')
    ),
    'province', coalesce(
      nullif(trim(v_snapshot ->> 'province'), ''),
      nullif(trim(v_snapshot ->> 'governorate'), ''),
      nullif(trim(v_order ->> 'governorate'), ''),
      nullif(trim(v_order ->> 'province'), ''),
      nullif(trim(v_order ->> 'city'), ''),
      nullif(trim(v_details ->> 'governorate'), ''),
      nullif(trim(v_details ->> 'province'), ''),
      nullif(trim(v_customer_row ->> 'state'), ''),
      nullif(trim(v_customer_row ->> 'governorate'), ''),
      nullif(trim(v_customer_row ->> 'province'), ''),
      nullif(trim(v_customer_row ->> 'city'), '')
    ),
    'address', coalesce(
      nullif(trim(v_snapshot ->> 'address'), ''),
      nullif(trim(v_snapshot ->> 'address_details'), ''),
      nullif(trim(v_order ->> 'address'), ''),
      nullif(trim(v_order ->> 'address_details'), ''),
      nullif(trim(v_order ->> 'delivery_address'), ''),
      nullif(trim(v_details ->> 'address'), ''),
      nullif(trim(v_details ->> 'address_details'), ''),
      nullif(trim(v_details ->> 'customer_address'), ''),
      nullif(trim(v_customer_row ->> 'address'), ''),
      nullif(trim(v_customer_row ->> 'address_details'), ''),
      nullif(trim(v_customer_row ->> 'full_address'), '')
    )
  ));

  if v_customer <> '{}'::jsonb then
    update public.order_store_segments
    set customer_snapshot = v_snapshot || v_customer,
        updated_at = now()
    where id = v_segment.id
      and customer_snapshot is distinct from (v_snapshot || v_customer);
  end if;

  return jsonb_build_object(
    'segment_id', v_segment.id,
    'order_id', v_segment.order_id,
    'order_code', coalesce(v_order ->> 'order_code', v_order ->> 'id'),
    'reference_order_no', v_order ->> 'reference_order_no',
    'order_created_at', v_order ->> 'created_at',
    'store_id', v_segment.store_id,
    'store_name', v_segment.store_name_snapshot,
    'items', v_segment.items_snapshot,
    'quantity_total', v_segment.quantity_total,
    'subtotal_local', v_segment.subtotal_local,
    'currency', v_segment.currency,
    'store_status', v_segment.store_status,
    'confirmed_at', v_segment.confirmed_at,
    'customer', v_customer,
    'customer_snapshot', v_customer,
    'commission', v_segment.commission_snapshot,
    'vendor_payment_status', v_segment.vendor_payment_status,
    'invoice_version', v_segment.invoice_version
  );
end;
$$;

revoke all on function public.vendor_get_order_segment_details(text, uuid) from public;
grant execute on function public.vendor_get_order_segment_details(text, uuid) to anon, authenticated;

commit;
