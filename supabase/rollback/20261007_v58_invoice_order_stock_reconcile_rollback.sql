-- Restores the supplied installed guard. Leaves corrected orders intact.
begin;
CREATE OR REPLACE FUNCTION public.meshwar_independent_vendor_order_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
v_old jsonb := coalesce(nullif(old.details::text, '')::jsonb, '{}'::jsonb);
v_new jsonb := coalesce(nullif(new.details::text, '')::jsonb, v_old);
v_key text;
v_immutable constant text[] := array[
'source', 'checkout_contract', 'checkout_group_id', 'vendor_order_id',
'items', 'stores', 'store_id', 'store_name', 'quantity',
'requested_quantity', 'item_count', 'customer_scope_id',
'customer_scope_type', 'submitted_at', 'customer_total_local',
'store_subtotal', 'currency', 'shipping_snapshot'
];
v_paid boolean;
begin
-- Preserve canonical submitted product and financial contract as before.
foreach v_key in array v_immutable loop
if v_old ? v_key then
v_new := jsonb_set(v_new, array[v_key], v_old -> v_key, true);
end if;
end loop;

-- Once the canonical stock engine has deducted inventory, stale staff detail
-- payloads must never erase or downgrade the deduction marker or its evidence.
v_paid := coalesce(v_old->>'bundle_stock_lifecycle_state','') = 'deducted'
or old.status = 'تم التسديد';
if coalesce(v_old->>'bundle_stock_lifecycle_state','') = 'deducted' then
v_new := jsonb_set(v_new, '{bundle_stock_lifecycle_state}', '"deducted"'::jsonb, true);
foreach v_key in array array[
'bundle_stock_deducted_at','bundle_variant_stock_deducted'
]::text[] loop
if v_old ? v_key then
v_new := jsonb_set(v_new, array[v_key], v_old -> v_key, true);
end if;
end loop;
end if;

-- Canonical paid orders cannot be cancelled/rejected. Operational shipping
-- statuses are unchanged; pre-payment cancellation remains available.
if v_paid and new.status is distinct from old.status
and new.status = any(array[
'مرفوض','رفض التسليم','رفض الطلب',
'ملغي من قبل العميل','ملغي','ملغى'
]::text[]) then
raise exception 'V94 paid independent vendor order cannot be cancelled or rejected'
using errcode='P0001';
end if;

new.details := v_new::text;
return new;
end;
$function$;

drop trigger if exists trg_meshwar_independent_vendor_order_guard on public.orders;
create trigger trg_meshwar_independent_vendor_order_guard before update of status,details on public.orders
for each row when (coalesce(private.v94_jsonb_object(to_jsonb(old.details))->>'checkout_contract','')='independent_vendor_orders')
execute function public.meshwar_independent_vendor_order_guard();
drop function if exists public.customer_reconcile_invoice_v58(text,uuid,boolean,text);
drop function if exists private.invoice_stock_projection_v58(public.orders);
notify pgrst,'reload schema';
commit;
