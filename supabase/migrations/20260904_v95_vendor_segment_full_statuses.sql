-- V95 vendor segment workflow
-- Expands the atomic per-store status RPC to the unified MeshWar status list.

begin;

create or replace function public.vendor_advance_order_segment_status(
  p_session_token text,
  p_segment_id uuid,
  p_expected_status text,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid := private.require_vendor_session(p_session_token);
  v_segment public.order_store_segments%rowtype;
  v_allowed_statuses constant text[] := array[
    'مستحق مكافأة',
    'ملغية من قبل العميل',
    'بانتظار رد الموظف',
    'بانتظار موافقة العميل',
    'بانتظار تأكيد الدفع',
    'تم التسديد',
    'قيد الطلب',
    'مخزن الشركة',
    'تجهيز شحن',
    'محولة إلى الفرع',
    'تم الشحن',
    'مخزن محلي',
    'مندوب',
    'توزيع داخلي',
    'تم التسليم',
    'رفض التسليم',
    'مرفوض'
  ];
begin
  select * into v_segment
  from public.order_store_segments s
  where s.id = p_segment_id
    and s.store_id = v_store_id
  for update;

  if v_segment.id is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_segment.payment_confirmed then
    raise exception 'ORDER_NOT_PAID' using errcode = 'P0001';
  end if;
  if v_segment.store_status is distinct from p_expected_status then
    raise exception 'ORDER_STATUS_CONFLICT:%', v_segment.store_status using errcode = '40001';
  end if;
  if nullif(trim(coalesce(p_next_status, '')), '') is null
     or not (p_next_status = any(v_allowed_statuses)) then
    raise exception 'ORDER_STATUS_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.order_store_segments
  set store_status = p_next_status,
      updated_at = now()
  where id = v_segment.id;

  perform private.mirror_v94_store_status(v_segment.order_id, v_store_id, p_next_status);

  return jsonb_build_object(
    'segment_id', v_segment.id,
    'order_id', v_segment.order_id,
    'previous_status', v_segment.store_status,
    'store_status', p_next_status,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.vendor_advance_order_segment_status(text, uuid, text, text) from public;
grant execute on function public.vendor_advance_order_segment_status(text, uuid, text, text) to anon, authenticated;

commit;
