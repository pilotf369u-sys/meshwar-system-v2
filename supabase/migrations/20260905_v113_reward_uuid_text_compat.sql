-- V113: fix customers UUID versus orders.customer_id text comparison.
begin;

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
     and p_amount > (
       coalesce(v_order.total_price, 0)
       + (
         case
           when private.v112_reward_currency(coalesce(v_order.delivery_currency, v_order.currency, 'IQD')) = v_currency
             then coalesce(v_order.delivery_fee, 0)
           else 0
         end
       )
     ) then
    raise exception 'REWARD_DISCOUNT_EXCEEDS_ORDER_TOTAL' using errcode = '22003';
  end if;
  if v_currency <> private.v112_reward_currency(coalesce(v_order.currency, 'IQD'))
     and p_amount > coalesce(v_order.delivery_fee, 0) then
    raise exception 'REWARD_DISCOUNT_EXCEEDS_DELIVERY_TOTAL' using errcode = '22003';
  end if;

  select * into v_customer from public.customers where id::text = v_order.customer_id::text for update;
  v_balance := coalesce(nullif(v_customer.reward_balances ->> v_currency, '')::numeric, 0);
  if v_balance < p_amount then raise exception 'REWARD_BALANCE_INSUFFICIENT' using errcode = '22003'; end if;

  v_snapshot := jsonb_build_object(
    'amount', p_amount, 'currency', v_currency, 'applied_at', now(),
    'applied_by', p_actor_id, 'source', 'reward_balances_v112'
  );
  update public.customers
  set reward_balances = jsonb_set(reward_balances, array[v_currency], to_jsonb(v_balance - p_amount), true),
      rewards_log = coalesce(rewards_log, '[]'::jsonb) || jsonb_build_array(v_snapshot || jsonb_build_object('type', 'order_discount', 'order_id', p_order_id, 'amount', -p_amount, 'date', now()))
  where id::text = v_order.customer_id::text;

  update public.orders
  set reward_discount_amount = p_amount,
      reward_discount_currency = v_currency,
      reward_discount_snapshot = v_snapshot
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'customer_id', v_order.customer_id,
    'discount', v_snapshot, 'remaining_balance', v_balance - p_amount);
end;
$$;

revoke all on function public.apply_order_reward_discount(uuid, numeric, text, text) from public;
grant execute on function public.apply_order_reward_discount(uuid, numeric, text, text) to anon, authenticated;

comment on function public.apply_order_reward_discount(uuid, numeric, text, text) is
'V113 atomic loyalty discount with UUID/text-safe customer matching.';

notify pgrst, 'reload schema';
commit;
