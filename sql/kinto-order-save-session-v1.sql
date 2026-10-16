-- Additive stage: install before deploying staff order-save callers. No trigger attachment.
BEGIN;
CREATE TABLE IF NOT EXISTS private.kinto_order_save_audit_v1(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL,
 previous_price numeric,new_price numeric,previous_currency text,new_currency text,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.kinto_order_save_audit_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE private.kinto_order_save_audit_v1 ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.kinto_save_staff_order_session_v1(
 p_role text,p_session_token text,p_order_id uuid,p_expected_status text,
 p_expected_price numeric,p_expected_currency text,p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; permissions jsonb; old_row public.orders%ROWTYPE;
 typed public.orders%ROWTYPE; old_details jsonb; next_details jsonb;
 price_changed boolean; assignment_changed boolean;
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('admin','employee') THEN
  RAISE EXCEPTION 'ORDER_SAVE_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 actor:=private.kinto_staff_actor_v1(p_role,p_session_token);
 permissions:=actor->'permissions';
 -- Match the existing employee UI: absent permissions allow; explicit false denies.
 -- Legacy JSON-string permissions are parsed just as the UI parses them.
 IF jsonb_typeof(permissions)='string' THEN
  BEGIN permissions:=(permissions#>>'{}')::jsonb;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'ORDER_SAVE_PERMISSIONS_INVALID' USING ERRCODE='42501'; END;
 END IF;
 IF p_role='employee' AND (permissions->'orders'='false'::jsonb OR permissions->'manage_orders'='false'::jsonb) THEN
  RAISE EXCEPTION 'ORDER_SAVE_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb
 OR EXISTS(SELECT FROM jsonb_object_keys(p_patch) k(key) WHERE k.key<>ALL(ARRAY[
 'status','reference_order_no','delivery_payment_type','branch_id','branch_name',
 'delivery_agent_id','courier_id','total_price','currency','rejection_reason','details','delivery_fee'])) THEN
  RAISE EXCEPTION 'ORDER_SAVE_PATCH_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO old_row FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_SAVE_NOT_FOUND'; END IF;
 IF old_row.status IS DISTINCT FROM p_expected_status OR old_row.total_price IS DISTINCT FROM p_expected_price
 OR old_row.currency IS DISTINCT FROM p_expected_currency THEN RAISE EXCEPTION 'ORDER_SAVE_CHANGED_RELOAD'; END IF;
 typed:=jsonb_populate_record(old_row,p_patch);
 -- The external-shipping editor sends the UUID only; keep its legacy courier ID in sync.
 IF typed.delivery_agent_id IS DISTINCT FROM old_row.delivery_agent_id AND NOT p_patch ? 'courier_id' THEN
  SELECT c.id::text INTO typed.courier_id FROM public.couriers c WHERE c.courier_uuid=typed.delivery_agent_id;
 END IF;
 IF typed.status IS DISTINCT FROM old_row.status AND (typed.status IS NULL OR typed.status NOT IN (
 'انتظار رد الموظف','بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير',
 'تم التسعير / بانتظار موافقة العميل','تمت الموافقة - بانتظار الدفع','تمت الموافقة',
 'ملغي من قبل العميل','قيد الطلب','مخزن شركة','تجهيز شحن','تم الشحن','مخزن محلي',
 'مندوب','توزيع داخلي','تم التسليم','رفض الطلب','مرفوض')) THEN
  RAISE EXCEPTION 'ORDER_SAVE_STATUS_DENIED'; END IF;
 -- Payment approval and payment-type edits keep their existing dedicated RPCs.
 IF typed.delivery_payment_type IS DISTINCT FROM old_row.delivery_payment_type THEN
  RAISE EXCEPTION 'ORDER_SAVE_USE_PAYMENT_TYPE_RPC' USING ERRCODE='42501'; END IF;
 price_changed:=typed.total_price IS DISTINCT FROM old_row.total_price OR typed.currency IS DISTINCT FROM old_row.currency;
 assignment_changed:=typed.branch_id IS DISTINCT FROM old_row.branch_id
 OR typed.delivery_agent_id IS DISTINCT FROM old_row.delivery_agent_id OR typed.courier_id IS DISTINCT FROM old_row.courier_id;
 IF p_role='employee' AND price_changed AND (permissions->'pricing'='false'::jsonb OR permissions->'manage_pricing'='false'::jsonb) THEN
  RAISE EXCEPTION 'ORDER_SAVE_PRICING_DENIED' USING ERRCODE='42501'; END IF;
 IF p_role='employee' AND assignment_changed AND (permissions->'branches'='false'::jsonb OR permissions->'manage_branches'='false'::jsonb) THEN
  RAISE EXCEPTION 'ORDER_SAVE_ASSIGNMENT_DENIED' USING ERRCODE='42501'; END IF;
 IF price_changed AND ((typed.total_price IS NOT NULL AND (typed.total_price<0 OR typed.total_price::text IN ('NaN','Infinity','-Infinity')))
 OR (typed.currency IS DISTINCT FROM old_row.currency AND (typed.currency IS NULL OR typed.currency NOT IN ('$','USD','IQD','TL','TRY','SYP','€','EUR')))) THEN
  RAISE EXCEPTION 'ORDER_SAVE_AMOUNT_INVALID'; END IF;
 IF typed.delivery_fee IS DISTINCT FROM old_row.delivery_fee AND typed.delivery_fee IS NOT NULL
 AND (typed.delivery_fee<0 OR typed.delivery_fee::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'ORDER_SAVE_FEE_INVALID'; END IF;
 IF p_role='employee' AND typed.delivery_fee IS DISTINCT FROM old_row.delivery_fee THEN
  RAISE EXCEPTION 'ORDER_SAVE_EMPLOYEE_FEE_DENIED' USING ERRCODE='42501'; END IF;
 -- SECURITY DEFINER bypasses the API-only settlement guard, so repeat its financial lock here.
 IF (old_row.settlement_id IS NOT NULL OR coalesce(old_row.is_settled,false)) AND
 (price_changed OR assignment_changed OR typed.delivery_fee IS DISTINCT FROM old_row.delivery_fee) THEN
  RAISE EXCEPTION 'ORDER_SAVE_SETTLEMENT_LOCKED' USING ERRCODE='42501'; END IF;
 IF assignment_changed THEN
  IF typed.branch_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.branches b WHERE b.id::text=typed.branch_id) THEN
   RAISE EXCEPTION 'ORDER_SAVE_BRANCH_INVALID'; END IF;
  IF typed.delivery_agent_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.couriers c
   WHERE c.courier_uuid=typed.delivery_agent_id AND coalesce(c.is_active,true)
   AND (typed.branch_id IS NULL OR c.branch_id=typed.branch_id)) THEN RAISE EXCEPTION 'ORDER_SAVE_COURIER_INVALID'; END IF;
  IF typed.courier_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.couriers c
   WHERE c.id::text=typed.courier_id AND coalesce(c.is_active,true)
   AND (typed.branch_id IS NULL OR c.branch_id=typed.branch_id)
   AND (typed.delivery_agent_id IS NULL OR c.courier_uuid=typed.delivery_agent_id)) THEN RAISE EXCEPTION 'ORDER_SAVE_COURIER_INVALID'; END IF;
 END IF;
 IF p_patch ? 'details' THEN
  old_details:=coalesce(nullif(old_row.details,'')::jsonb,'{}'::jsonb);
  next_details:=coalesce(nullif(typed.details,'')::jsonb,'{}'::jsonb);
  IF jsonb_typeof(old_details) IS DISTINCT FROM 'object' OR jsonb_typeof(next_details) IS DISTINCT FROM 'object'
  OR (old_details-'parcels_count') IS DISTINCT FROM (next_details-'parcels_count') THEN
   RAISE EXCEPTION 'ORDER_SAVE_DETAILS_DENIED' USING ERRCODE='42501'; END IF;
  IF next_details IS DISTINCT FROM old_details THEN
   IF jsonb_typeof(next_details->'parcels_count') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'ORDER_SAVE_PARCELS_INVALID'; END IF;
   IF (next_details->>'parcels_count')::numeric NOT BETWEEN 1 AND 100000
   OR (next_details->>'parcels_count')::numeric<>trunc((next_details->>'parcels_count')::numeric) THEN RAISE EXCEPTION 'ORDER_SAVE_PARCELS_INVALID'; END IF;
  END IF;
 END IF;
 -- Names are display metadata derived from the selected branch, never identity evidence.
 IF typed.branch_id IS DISTINCT FROM old_row.branch_id THEN
  SELECT b.name INTO typed.branch_name FROM public.branches b WHERE b.id::text=typed.branch_id;
 ELSE typed.branch_name:=old_row.branch_name; END IF;
 UPDATE public.orders SET status=typed.status,reference_order_no=typed.reference_order_no,
 branch_id=typed.branch_id,branch_name=typed.branch_name,delivery_agent_id=typed.delivery_agent_id,
 courier_id=typed.courier_id,total_price=typed.total_price,currency=typed.currency,
 rejection_reason=typed.rejection_reason,details=typed.details,delivery_fee=typed.delivery_fee WHERE id=p_order_id;
 -- Existing local-price, stock, paid-marker and lifecycle triggers still run above.
 IF price_changed THEN
  INSERT INTO private.kinto_order_save_audit_v1(order_id,actor_type,actor_id,previous_price,new_price,previous_currency,new_currency)
  VALUES(p_order_id,p_role,actor->>'id',old_row.total_price,typed.total_price,old_row.currency,typed.currency);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION private.kinto_order_price_api_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND
 (NEW.total_price IS DISTINCT FROM OLD.total_price OR NEW.currency IS DISTINCT FROM OLD.currency) THEN
  RAISE EXCEPTION 'ORDER_PRICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_order_price_api_guard_v1() FROM PUBLIC,anon,authenticated;
COMMIT;
