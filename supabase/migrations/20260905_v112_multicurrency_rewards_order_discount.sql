-- V112: multi-currency rewards wallet and atomic per-order loyalty discount.
begin;

alter table public.customers
  add column if not exists reward_balances jsonb not null default '{}'::jsonb,
  add column if not exists rewards_log jsonb not null default '[]'::jsonb;

alter table public.orders
  add column if not exists reward_discount_amount numeric(18, 4) not null default 0,
  add column if not exists reward_discount_currency text,
  add column if not exists reward_discount_snapshot jsonb not null default '{}'::jsonb;

alter table public.orders
  drop constraint if exists orders_reward_discount_nonnegative;
alter table public.orders
  add constraint orders_reward_discount_nonnegative
  check (reward_discount_amount >= 0);

create or replace function private.v112_reward_currency(p_currency text)
returns text
language sql
immutable
strict
as $$
  select case upper(trim(p_currency))
    when '$' then 'USD'
    when 'TL' then 'TRY'
    else upper(trim(p_currency))
  end
$$;

do $$
declare
  v_balance_column text;
  v_currency_column text;
begin
  select column_name into v_balance_column
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customers'
    and column_name in ('wallet_balance', 'balance')
  order by case column_name when 'wallet_balance' then 1 else 2 end
  limit 1;
  select column_name into v_currency_column
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customers'
    and column_name in ('wallet_currency', 'balance_currency', 'reward_currency')
  order by case column_name when 'wallet_currency' then 1 when 'balance_currency' then 2 else 3 end
  limit 1;
  if v_balance_column is not null and v_currency_column is not null then
    execute format(
      'update public.customers set reward_balances = jsonb_build_object(private.v112_reward_currency(coalesce(%1$I::text, ''USD'')), coalesce(%2$I, 0)) || coalesce(reward_balances, ''{}''::jsonb) where coalesce(%2$I, 0) <> 0',
      v_currency_column, v_balance_column
    );
  end if;
end;
$$;

create or replace function private.v112_require_reward_actor(p_actor_id text)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role text;
begin
  select lower(trim(coalesce(e.role::text, '')))
    into v_role
  from public.employees e
  where e.id::text = trim(coalesce(p_actor_id, ''))
  limit 1;

  if v_role not in ('admin', 'employee', 'أدمن', 'ادمن', 'موظف') then
    raise exception 'REWARD_ACTOR_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function public.adjust_customer_reward_balance(
  p_customer_id uuid,
  p_amount numeric,
  p_currency text,
  p_actor_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_currency text := private.v112_reward_currency(p_currency);
  v_customer public.customers%rowtype;
  v_current numeric;
  v_next numeric;
  v_entry jsonb;
begin
  perform private.v112_require_reward_actor(p_actor_id);
  if v_currency not in ('USD', 'IQD', 'TRY') then
    raise exception 'REWARD_CURRENCY_NOT_SUPPORTED' using errcode = '22023';
  end if;
  if coalesce(p_amount, 0) = 0 then
    raise exception 'REWARD_AMOUNT_REQUIRED' using errcode = '22023';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002'; end if;

  v_current := coalesce(nullif(v_customer.reward_balances ->> v_currency, '')::numeric, 0);
  v_next := v_current + p_amount;
  if v_next < 0 then raise exception 'REWARD_BALANCE_INSUFFICIENT' using errcode = '22003'; end if;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'amount', p_amount,
    'currency', v_currency,
    'type', case when p_amount > 0 then 'grant' else 'withdraw' end,
    'date', now(),
    'actor_id', p_actor_id,
    'note', nullif(trim(coalesce(p_note, '')), '')
  ));

  update public.customers
  set reward_balances = jsonb_set(coalesce(reward_balances, '{}'::jsonb), array[v_currency], to_jsonb(v_next), true),
      rewards_log = coalesce(rewards_log, '[]'::jsonb) || jsonb_build_array(v_entry)
  where id = p_customer_id;

  return jsonb_build_object('customer_id', p_customer_id, 'currency', v_currency,
    'balance', v_next, 'reward_balances', jsonb_set(coalesce(v_customer.reward_balances, '{}'::jsonb), array[v_currency], to_jsonb(v_next), true));
end;
$$;

create or replace function public.apply_order_reward_discount(
  p_order_id uuid,
  p_amount numeric,
  p_currency text,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_currency text := private.v112_reward_currency(p_currency);
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_balance numeric;
  v_snapshot jsonb;
begin
  perform private.v112_require_reward_actor(p_actor_id);
  if v_currency not in ('USD', 'IQD', 'TRY') or coalesce(p_amount, 0) <= 0 then
    raise exception 'INVALID_REWARD_DISCOUNT' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.customer_id is null then raise exception 'ORDER_CUSTOMER_REQUIRED' using errcode = '22023'; end if;
  if coalesce(v_order.reward_discount_amount, 0) > 0 then
    raise exception 'ORDER_REWARD_ALREADY_APPLIED' using errcode = '23505';
  end if;
  if coalesce(v_order.status, '') ~ '(تم التسليم|ملغي|رفض|مرفوض|راجع)' then
    raise exception 'ORDER_REWARD_STATUS_LOCKED' using errcode = '55000';
  end if;
  if v_currency not in (
    private.v112_reward_currency(coalesce(v_order.currency, 'IQD')),
    private.v112_reward_currency(coalesce(v_order.delivery_currency, v_order.currency, 'IQD'))
  ) then
    raise exception 'REWARD_CURRENCY_NOT_IN_ORDER' using errcode = '22023';
  end if;
  if v_currency = private.v112_reward_currency(coalesce(v_order.currency, 'IQD'))
     and p_amount > coalesce(v_order.total_price, 0)
       + case when private.v112_reward_currency(coalesce(v_order.delivery_currency, v_order.currency, 'IQD')) = v_currency then coalesce(v_order.delivery_fee, 0) else 0 end then
    raise exception 'REWARD_DISCOUNT_EXCEEDS_ORDER_TOTAL' using errcode = '22003';
  end if;
  if v_currency <> private.v112_reward_currency(coalesce(v_order.currency, 'IQD'))
     and p_amount > coalesce(v_order.delivery_fee, 0) then
    raise exception 'REWARD_DISCOUNT_EXCEEDS_DELIVERY_TOTAL' using errcode = '22003';
  end if;

  select * into v_customer from public.customers where id = v_order.customer_id for update;
  v_balance := coalesce(nullif(v_customer.reward_balances ->> v_currency, '')::numeric, 0);
  if v_balance < p_amount then raise exception 'REWARD_BALANCE_INSUFFICIENT' using errcode = '22003'; end if;

  v_snapshot := jsonb_build_object(
    'amount', p_amount, 'currency', v_currency, 'applied_at', now(),
    'applied_by', p_actor_id, 'source', 'reward_balances_v112'
  );
  update public.customers
  set reward_balances = jsonb_set(reward_balances, array[v_currency], to_jsonb(v_balance - p_amount), true),
      rewards_log = coalesce(rewards_log, '[]'::jsonb) || jsonb_build_array(v_snapshot || jsonb_build_object('type', 'order_discount', 'order_id', p_order_id, 'amount', -p_amount, 'date', now()))
  where id = v_order.customer_id;

  update public.orders
  set reward_discount_amount = p_amount,
      reward_discount_currency = v_currency,
      reward_discount_snapshot = v_snapshot,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'customer_id', v_order.customer_id,
    'discount', v_snapshot, 'remaining_balance', v_balance - p_amount);
end;
$$;

revoke all on function public.adjust_customer_reward_balance(uuid, numeric, text, text, text) from public;
revoke all on function public.apply_order_reward_discount(uuid, numeric, text, text) from public;
grant execute on function public.adjust_customer_reward_balance(uuid, numeric, text, text, text) to anon, authenticated;
grant execute on function public.apply_order_reward_discount(uuid, numeric, text, text) to anon, authenticated;

create index if not exists orders_reward_discount_customer_idx
  on public.orders(customer_id) where reward_discount_amount > 0;

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
        'reward_discount_snapshot', o.reward_discount_snapshot
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

notify pgrst, 'reload schema';
commit;
