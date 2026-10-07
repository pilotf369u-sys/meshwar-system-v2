-- V138: assign each external-shipping charge to exactly one store segment.
-- The amount remains on orders and is never added to store revenue.
begin;

alter table public.orders
  add column if not exists external_shipping_collector_segment_id uuid
  references public.order_store_segments(id) on delete set null;

create index if not exists idx_orders_external_shipping_collector
  on public.orders(external_shipping_collector_segment_id)
  where external_shipping_collector_segment_id is not null;

create or replace function private.v138_normalize_external_shipping_collector()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_segment_order_id uuid;
begin
  if coalesce(new.external_shipping_fee, 0) <= 0 then
    new.external_shipping_collector_segment_id := null;
    return new;
  end if;

  if new.external_shipping_collector_segment_id is not null then
    select s.order_id into v_segment_order_id
    from public.order_store_segments s
    where s.id = new.external_shipping_collector_segment_id;
    if v_segment_order_id is distinct from new.id then
      raise exception 'EXTERNAL_SHIPPING_COLLECTOR_NOT_IN_ORDER' using errcode = '23514';
    end if;
    return new;
  end if;

  select s.id into new.external_shipping_collector_segment_id
  from public.order_store_segments s
  where s.order_id = new.id
  order by s.created_at, s.id
  limit 1;
  return new;
end;
$$;

drop trigger if exists trg_v138_normalize_external_shipping_collector on public.orders;
create trigger trg_v138_normalize_external_shipping_collector
before insert or update of external_shipping_fee, external_shipping_collector_segment_id
on public.orders
for each row execute function private.v138_normalize_external_shipping_collector();

create or replace function private.v138_assign_collector_after_segment_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
  set external_shipping_collector_segment_id = (
    select s.id from public.order_store_segments s
    where s.order_id = o.id
    order by s.created_at, s.id
    limit 1
  )
  where o.id = v_order_id
    and coalesce(o.external_shipping_fee, 0) > 0
    and (
      o.external_shipping_collector_segment_id is null
      or not exists (
        select 1 from public.order_store_segments current_segment
        where current_segment.id = o.external_shipping_collector_segment_id
          and current_segment.order_id = o.id
      )
    );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_v138_assign_collector_after_segment_change on public.order_store_segments;
create trigger trg_v138_assign_collector_after_segment_change
after insert or update of order_id or delete on public.order_store_segments
for each row execute function private.v138_assign_collector_after_segment_change();

-- Backfill only the new reference. No order state, totals, details, or workflow fields change.
update public.orders o
set external_shipping_collector_segment_id = (
  select s.id from public.order_store_segments s
  where s.order_id = o.id
  order by s.created_at, s.id
  limit 1
)
where coalesce(o.external_shipping_fee, 0) > 0
  and o.external_shipping_collector_segment_id is null
  and exists (select 1 from public.order_store_segments s where s.order_id = o.id);

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
        'delivery_payment_type', o.delivery_payment_type,
        'reward_discount_amount', o.reward_discount_amount,
        'reward_discount_currency', o.reward_discount_currency,
        'reward_discount_snapshot', o.reward_discount_snapshot,
        'is_external_shipping_collector', o.external_shipping_collector_segment_id = s.id,
        'external_shipping_fee', case when o.external_shipping_collector_segment_id = s.id then coalesce(o.external_shipping_fee, 0) else 0 end,
        'external_shipping_currency', case when o.external_shipping_collector_segment_id = s.id then coalesce(nullif(o.external_shipping_currency, ''), o.currency) else null end
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

revoke all on function public.vendor_list_order_shipping_controls(text, uuid[]) from public;
grant execute on function public.vendor_list_order_shipping_controls(text, uuid[]) to anon, authenticated;

comment on column public.orders.external_shipping_collector_segment_id is
  'The single store segment that collects the parent order external shipping fee as a KINTO pass-through liability.';

notify pgrst, 'reload schema';
commit;
