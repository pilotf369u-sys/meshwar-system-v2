-- KINTO V99 — expose immutable shipping snapshots in the secure vendor order list.
-- The list remains session-scoped and returns one store segment per row.

begin;

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
  segment_updated_at timestamptz
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
    nullif(o.shipping_company_name::text, ''),
    coalesce(o.delivery_fee, 0)::numeric,
    coalesce(
      nullif(o.delivery_currency::text, ''),
      s.currency
    ),
    coalesce(o.shipping_snapshot, '{}'::jsonb),
    s.updated_at
  from public.order_store_segments s
  join public.orders o on o.id = s.order_id
  where s.store_id = v_store_id
    and s.payment_confirmed = true
  order by s.confirmed_at desc nulls last, s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.vendor_list_order_segments(
  text,
  integer,
  integer
) from public;

grant execute on function public.vendor_list_order_segments(
  text,
  integer,
  integer
) to anon, authenticated;

comment on function public.vendor_list_order_segments(
  text,
  integer,
  integer
) is
'V99 session-scoped vendor projection with immutable order shipping snapshot and segment update cursor for realtime reconciliation.';

notify pgrst, 'reload schema';

commit;
