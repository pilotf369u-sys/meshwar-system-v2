-- V60: customer receipt confirmation is a separate immutable acknowledgement.
-- It never changes order status, totals, stock, shipping, or loyalty balances.
begin;

create table if not exists public.order_customer_receipts_v60 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id text not null,
  confirmed_at timestamptz not null default now()
);

alter table public.order_customer_receipts_v60 enable row level security;
revoke all on table public.order_customer_receipts_v60 from public, anon, authenticated;

create or replace function public.customer_order_receipt_state_v60(
  p_session_token text,
  p_order_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_customer_id uuid;
  v_receipt public.order_customer_receipts_v60%rowtype;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.customer_id::text = v_customer_id::text
  ) then
    raise exception 'V60_ORDER_NOT_FOUND';
  end if;

  select * into v_receipt
  from public.order_customer_receipts_v60
  where order_id = p_order_id and customer_id = v_customer_id::text;

  return jsonb_build_object(
    'confirmed', found,
    'confirmed_at', case when found then v_receipt.confirmed_at else null end
  );
end;
$function$;

create or replace function public.customer_confirm_order_receipt_v60(
  p_session_token text,
  p_order_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_customer_id uuid;
  v_confirmed_at timestamptz;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.customer_id::text = v_customer_id::text
      and o.status = 'تم التسليم'
  ) then
    raise exception 'V60_DELIVERED_ORDER_NOT_FOUND';
  end if;

  insert into public.order_customer_receipts_v60(order_id, customer_id)
  values (p_order_id, v_customer_id::text)
  on conflict (order_id) do nothing;

  select confirmed_at into v_confirmed_at
  from public.order_customer_receipts_v60
  where order_id = p_order_id and customer_id = v_customer_id::text;

  return jsonb_build_object('confirmed', true, 'confirmed_at', v_confirmed_at);
end;
$function$;

revoke all on function public.customer_order_receipt_state_v60(text,uuid) from public;
revoke all on function public.customer_confirm_order_receipt_v60(text,uuid) from public;
grant execute on function public.customer_order_receipt_state_v60(text,uuid) to anon, authenticated;
grant execute on function public.customer_confirm_order_receipt_v60(text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
