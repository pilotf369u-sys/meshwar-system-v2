-- Customer official invoice V45: atomic approval + server-side invoice export gate.
-- delivery_fee is never overwritten by approval; NULL/0 is returned as-is to the UI.

create or replace function public.customer_approve_order_invoice(
  p_order_id text,
  p_customer_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id::text = p_order_id
    and customer_id::text = p_customer_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if coalesce(v_order.status,'') not in (
    'بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'
  ) then
    raise exception 'ORDER_NOT_APPROVABLE';
  end if;

  if coalesce(v_order.total_price,0) <= 0 then
    raise exception 'ORDER_PRICE_INVALID';
  end if;

  update public.orders
  set status = 'تمت الموافقة - بانتظار الدفع'
  where id::text = p_order_id
    and customer_id::text = p_customer_id
  returning * into v_order;

  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'total_price', v_order.total_price,
    'external_shipping_fee', v_order.external_shipping_fee,
    'delivery_fee', v_order.delivery_fee,
    'currency', v_order.currency
  );
end;
$$;

create or replace function public.customer_get_approved_invoice(
  p_order_id text,
  p_customer_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id::text = p_order_id
    and customer_id::text = p_customer_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Hard backend gate: cancelled/rejected/unapproved orders can never be exported.
  if coalesce(v_order.status,'') not in ('approved','تمت الموافقة','تمت الموافقة - بانتظار الدفع') then
    raise exception 'INVOICE_EXPORT_NOT_ALLOWED';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'order_code', v_order.order_code,
    'status', v_order.status,
    'total_price', v_order.total_price,
    'external_shipping_fee', v_order.external_shipping_fee,
    'delivery_fee', v_order.delivery_fee,
    'currency', v_order.currency,
    'image_url', v_order.image_url,
    'details', v_order.details,
    'created_at', v_order.created_at
  );
end;
$$;

revoke all on function public.customer_approve_order_invoice(text,text) from public;
revoke all on function public.customer_get_approved_invoice(text,text) from public;
grant execute on function public.customer_approve_order_invoice(text,text) to anon, authenticated;
grant execute on function public.customer_get_approved_invoice(text,text) to anon, authenticated;

notify pgrst, 'reload schema';
