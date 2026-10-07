-- V107: expose the canonical collection status to the vendor invoice safely.

begin;

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
      || jsonb_build_object(
        'delivery_payment_type', o.delivery_payment_type
      )
  ), '{}'::jsonb)
  into v_result
  from public.order_store_segments s
  join public.orders o on o.id = s.order_id
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

comment on function public.vendor_list_order_shipping_controls(text, uuid[]) is
'V107 secure vendor invoice projection including the canonical delivery collection status.';

notify pgrst, 'reload schema';
commit;
