-- V140: one finance envelope per independent checkout group.
-- This is additive and never updates order status, details, tracking, stock or sales.
begin;

create table if not exists public.checkout_group_finance (
  checkout_group_id uuid primary key,
  external_shipping_fee numeric(14,2) not null default 0 check (external_shipping_fee >= 0),
  external_shipping_currency text not null default 'IQD',
  collector_segment_id uuid references public.order_store_segments(id) on delete set null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checkout_group_finance enable row level security;
revoke all on public.checkout_group_finance from public, anon, authenticated;

insert into public.checkout_group_finance(
  checkout_group_id, external_shipping_fee, external_shipping_currency, collector_segment_id, updated_by
)
select
  x.group_id,
  max(coalesce(o.external_shipping_fee, 0)),
  coalesce((array_agg(coalesce(nullif(o.external_shipping_currency, ''), o.currency, 'IQD') order by o.created_at))[1], 'IQD'),
  (
    select s.id
    from public.orders grouped_order
    join public.order_store_segments s on s.order_id = grouped_order.id
    where private.v94_uuid(private.v94_jsonb_object(to_jsonb(grouped_order.details)) ->> 'checkout_group_id') = x.group_id
    order by grouped_order.created_at, s.created_at, s.id
    limit 1
  ),
  'v140_backfill'
from public.orders o
cross join lateral (
  select private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id') as group_id
) x
where x.group_id is not null
group by x.group_id
on conflict (checkout_group_id) do nothing;

create or replace function private.v140_group_is_locked(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select not exists (
    select 1
    from public.orders o
    where private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id') = p_group_id
      and coalesce(o.status, '') in (
        'انتظار رد الموظف','بانتظار موافقة العميل','بانتظار موافقة الزبون',
        'بانتظار التسعير','تم التسعير / بانتظار موافقة العميل',
        'تمت الموافقة - بانتظار الدفع','تمت الموافقة'
      )
  );
$$;

create or replace function public.get_checkout_group_finance(
  p_checkout_group_ids uuid[],
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform private.v112_require_reward_actor(p_actor_id);
  if coalesce(array_length(p_checkout_group_ids, 1), 0) > 100 then
    raise exception 'CHECKOUT_GROUP_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(group_id::text, payload), '{}'::jsonb)
  into v_result
  from (
    select
      g.group_id,
      jsonb_build_object(
        'checkout_group_id', g.group_id,
        'external_shipping_fee', coalesce(f.external_shipping_fee, 0),
        'external_shipping_currency', coalesce(nullif(f.external_shipping_currency, ''), g.currency, 'IQD'),
        'collector_segment_id', f.collector_segment_id,
        'locked', private.v140_group_is_locked(g.group_id),
        'orders', g.orders
      ) as payload
    from (
      select
        private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id') as group_id,
        coalesce((array_agg(coalesce(o.currency, 'IQD') order by o.created_at))[1], 'IQD') as currency,
        jsonb_agg(to_jsonb(o) order by o.created_at, o.id) as orders
      from public.orders o
      where private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id')
        = any(coalesce(p_checkout_group_ids, array[]::uuid[]))
      group by private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id')
    ) g
    left join public.checkout_group_finance f on f.checkout_group_id = g.group_id
  ) rows;
  return v_result;
end;
$$;

create or replace function public.save_checkout_group_external_shipping(
  p_checkout_group_id uuid,
  p_external_shipping_fee numeric,
  p_external_shipping_currency text,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_collector uuid;
begin
  perform private.v112_require_reward_actor(p_actor_id);
  if coalesce(p_external_shipping_fee, -1) < 0 then
    raise exception 'INVALID_EXTERNAL_SHIPPING_FEE' using errcode = '22023';
  end if;
  if private.v140_group_is_locked(p_checkout_group_id) then
    raise exception 'CHECKOUT_GROUP_FINANCE_LOCKED' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.orders o
    where private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id') = p_checkout_group_id
  ) then
    raise exception 'CHECKOUT_GROUP_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_external_shipping_fee > 0 then
    select s.id into v_collector
    from public.orders o
    join public.order_store_segments s on s.order_id = o.id
    where private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id') = p_checkout_group_id
    order by o.created_at, s.created_at, s.id
    limit 1;
  end if;

  insert into public.checkout_group_finance(
    checkout_group_id, external_shipping_fee, external_shipping_currency,
    collector_segment_id, updated_by, updated_at
  ) values (
    p_checkout_group_id, p_external_shipping_fee,
    upper(trim(coalesce(nullif(p_external_shipping_currency, ''), 'IQD'))),
    v_collector, p_actor_id, now()
  )
  on conflict (checkout_group_id) do update set
    external_shipping_fee = excluded.external_shipping_fee,
    external_shipping_currency = excluded.external_shipping_currency,
    collector_segment_id = excluded.collector_segment_id,
    updated_by = excluded.updated_by,
    updated_at = now();

  return (public.get_checkout_group_finance(array[p_checkout_group_id], p_actor_id) -> p_checkout_group_id::text);
end;
$$;

revoke all on function public.get_checkout_group_finance(uuid[], text) from public;
revoke all on function public.save_checkout_group_external_shipping(uuid, numeric, text, text) from public;
grant execute on function public.get_checkout_group_finance(uuid[], text) to anon, authenticated;
grant execute on function public.save_checkout_group_external_shipping(uuid, numeric, text, text) to anon, authenticated;

-- Supersede V139 projection: grouped orders expose the fee to exactly one
-- collector segment across the whole checkout, never once per vendor order.
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
        'is_external_shipping_collector', coalesce(f.collector_segment_id, o.external_shipping_collector_segment_id) = s.id,
        'external_shipping_fee', case
          when f.checkout_group_id is not null and f.collector_segment_id = s.id then f.external_shipping_fee
          when f.checkout_group_id is null and o.external_shipping_collector_segment_id = s.id then coalesce(o.external_shipping_fee, 0)
          else 0 end,
        'external_shipping_currency', case
          when f.checkout_group_id is not null and f.collector_segment_id = s.id then f.external_shipping_currency
          when f.checkout_group_id is null and o.external_shipping_collector_segment_id = s.id then coalesce(nullif(o.external_shipping_currency, ''), o.currency)
          else null end
      )
  ), '{}'::jsonb)
  into v_result
  from public.order_store_segments s
  join public.orders o on o.id = s.order_id
  cross join lateral (
    select private.v94_uuid(private.v94_jsonb_object(to_jsonb(o.details)) ->> 'checkout_group_id') as group_id
  ) x
  left join public.checkout_group_finance f on f.checkout_group_id = x.group_id
  where s.store_id = v_store_id
    and s.payment_confirmed = true
    and s.id = any(coalesce(p_segment_ids, array[]::uuid[]));
  return v_result;
end;
$$;

revoke all on function public.vendor_list_order_shipping_controls(text, uuid[]) from public;
grant execute on function public.vendor_list_order_shipping_controls(text, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
