-- KINTO payment gate: deploy SQL before merging dashboard PR.
-- Run preflight and transactional smoke checks; never merge UI first.
-- Intentionally no changes to existing stock, campaign, invoice or vendor triggers.
BEGIN;
CREATE TABLE IF NOT EXISTS private.kinto_paid_transition_permits_v1 (
  transaction_id bigint NOT NULL,
  order_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, order_id)
);
REVOKE ALL ON private.kinto_paid_transition_permits_v1 FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.kinto_paid_approval_audit_v1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('employee','admin')),
  actor_id text NOT NULL,
  previous_status text,
  approved_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.kinto_paid_approval_audit_v1 FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION private.kinto_paid_transition_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp
AS $kinto_guard$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'تم التسديد') THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_INSERT_DENIED' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'تم التسديد' THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.kinto_paid_transition_permits_v1 p
      WHERE p.transaction_id = txid_current() AND p.order_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'KINTO_PAYMENT_APPROVAL_REQUIRED' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$kinto_guard$;
DROP TRIGGER IF EXISTS trg_kinto_paid_transition_guard_v1 ON public.orders;
DROP TRIGGER IF EXISTS trg_kinto_paid_insert_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_paid_insert_guard_v1
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_paid_transition_guard_v1();
CREATE TRIGGER trg_kinto_paid_transition_guard_v1
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_paid_transition_guard_v1();
CREATE OR REPLACE FUNCTION private.kinto_paid_marker_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp
AS $marker$
DECLARE
  old_json jsonb;
  new_json jsonb;
BEGIN
  IF NEW.details IS DISTINCT FROM OLD.details THEN
    old_json := coalesce(nullif(OLD.details, '')::jsonb, '{}'::jsonb);
    new_json := coalesce(nullif(NEW.details, '')::jsonb, '{}'::jsonb);
    -- Stock lifecycle evidence may be written by existing server-side triggers.
    -- Require the one-transaction approval permit when the marker enters deducted.
    IF old_json->>'bundle_stock_lifecycle_state' IS DISTINCT FROM 'deducted'
       AND new_json->>'bundle_stock_lifecycle_state' = 'deducted'
       AND NOT EXISTS (
         SELECT 1 FROM private.kinto_paid_transition_permits_v1 p
         WHERE p.transaction_id = txid_current() AND p.order_id = NEW.id
       ) THEN
      RAISE EXCEPTION 'KINTO_PAYMENT_MARKER_FORGERY_DENIED' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$marker$;
DROP TRIGGER IF EXISTS trg_kinto_paid_marker_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_paid_marker_guard_v1
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_paid_marker_guard_v1();
-- This RPC accepts the exact patch used by the two dashboard save actions.
-- It validates a custom employee/admin session on the server before granting a one-transaction permit.
CREATE OR REPLACE FUNCTION public.kinto_approve_paid_order_v1(
  p_session_token text,
  p_actor text,
  p_order_id uuid,
  p_expected_status text,
  p_patch jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp
AS $$
DECLARE
  v_id text;
  v_old public.orders%ROWTYPE;
  v_typed public.orders%ROWTYPE;
  v_previous_details jsonb;
  v_requested_details jsonb;
BEGIN
  IF p_actor = 'employee' THEN
    v_id := private.require_employee_session_v143(p_session_token);
  ELSIF p_actor = 'admin' THEN
    v_id := private.require_admin_session_v147(p_session_token);
  ELSE
    RAISE EXCEPTION 'KINTO_PAYMENT_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_SESSION_INVALID' USING ERRCODE='42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
     OR p_patch->>'status' IS DISTINCT FROM 'تم التسديد'
     OR p_patch ?| ARRAY['id','created_at','order_code','customer_id'] THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_PATCH_INVALID';
  END IF;
  -- Only the fields currently written by the employee/admin order-save controls.
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
    WHERE k.key <> ALL(ARRAY[
      'status','reference_order_no','delivery_payment_type','branch_id',
      'branch_name','delivery_agent_id','courier_id','total_price','currency',
      'rejection_reason','details','delivery_fee'
    ])
  ) THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_PATCH_FIELDS_DENIED';
  END IF;
  SELECT * INTO v_old FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KINTO_ORDER_NOT_FOUND'; END IF;
  IF v_old.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'KINTO_ORDER_STATUS_CHANGED';
  END IF;
  IF v_old.status IS NULL OR btrim(v_old.status) = '' THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_PREVIOUS_STATUS_REQUIRED';
  END IF;
  IF v_old.status = 'تم التسديد' THEN
    RAISE EXCEPTION 'KINTO_ORDER_ALREADY_PAID';
  END IF;
  -- Compare financial values using the database column types, including SQL NULL.
  -- Dashboard saves send unchanged financial values; a mismatched value is rejected.
  IF (p_patch ? 'total_price' AND (p_patch->>'total_price')::numeric IS DISTINCT FROM v_old.total_price)
     OR (p_patch ? 'delivery_fee' AND (p_patch->>'delivery_fee')::numeric IS DISTINCT FROM v_old.delivery_fee)
     OR (p_patch ? 'currency' AND p_patch->>'currency' IS DISTINCT FROM v_old.currency)
  THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_FINANCIAL_FIELDS_CHANGE_DENIED' USING ERRCODE='42501';
  END IF;
  -- The employee UI may change only the parcel count while approving payment.
  -- Prevent a forged RPC patch from changing cart items, prices or stock evidence.
  IF p_patch ? 'details' THEN
    BEGIN
      v_previous_details := coalesce(nullif(v_old.details, '')::jsonb, '{}'::jsonb);
      v_requested_details := coalesce(nullif(p_patch->>'details', '')::jsonb, '{}'::jsonb);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'KINTO_PAYMENT_DETAILS_INVALID';
    END;
    IF jsonb_typeof(v_previous_details) <> 'object'
       OR jsonb_typeof(v_requested_details) <> 'object'
       OR (v_requested_details - 'parcels_count') IS DISTINCT FROM
          (v_previous_details - 'parcels_count')
       OR (v_requested_details IS DISTINCT FROM v_previous_details AND (
         jsonb_typeof(v_requested_details->'parcels_count') IS DISTINCT FROM 'number'
         OR (v_requested_details->>'parcels_count')::numeric < 1
         OR (v_requested_details->>'parcels_count')::numeric > 100000
         OR (v_requested_details->>'parcels_count')::numeric <> trunc((v_requested_details->>'parcels_count')::numeric)
       )
    THEN
      RAISE EXCEPTION 'KINTO_PAYMENT_DETAILS_CHANGE_DENIED';
    END IF;
  END IF;
  -- PostgreSQL performs column-type conversion using the real orders row type.
  v_typed := jsonb_populate_record(NULL::public.orders, p_patch);
  INSERT INTO private.kinto_paid_transition_permits_v1(transaction_id,order_id)
    VALUES(txid_current(),p_order_id);
  UPDATE public.orders o SET
    status = 'تم التسديد',
    reference_order_no = CASE WHEN p_patch ? 'reference_order_no' THEN p_patch->>'reference_order_no' ELSE o.reference_order_no END,
    delivery_payment_type = CASE WHEN p_patch ? 'delivery_payment_type' THEN p_patch->>'delivery_payment_type' ELSE o.delivery_payment_type END,
    branch_id = CASE WHEN p_patch ? 'branch_id' THEN p_patch->>'branch_id' ELSE o.branch_id END,
    branch_name = CASE WHEN p_patch ? 'branch_name' THEN p_patch->>'branch_name' ELSE o.branch_name END,
    delivery_agent_id = CASE WHEN p_patch ? 'delivery_agent_id' THEN v_typed.delivery_agent_id ELSE o.delivery_agent_id END,
    courier_id = CASE WHEN p_patch ? 'courier_id' THEN v_typed.courier_id ELSE o.courier_id END,
    total_price = CASE WHEN p_patch ? 'total_price' THEN v_typed.total_price ELSE o.total_price END,
    currency = CASE WHEN p_patch ? 'currency' THEN p_patch->>'currency' ELSE o.currency END,
    rejection_reason = CASE WHEN p_patch ? 'rejection_reason' THEN p_patch->>'rejection_reason' ELSE o.rejection_reason END,
    details = CASE WHEN p_patch ? 'details' THEN p_patch->>'details' ELSE o.details END,
    delivery_fee = CASE WHEN p_patch ? 'delivery_fee' THEN v_typed.delivery_fee ELSE o.delivery_fee END
  WHERE o.id=p_order_id;
  INSERT INTO private.kinto_paid_approval_audit_v1(order_id,actor_type,actor_id,previous_status)
    VALUES(p_order_id,p_actor,v_id,v_old.status);
  DELETE FROM private.kinto_paid_transition_permits_v1
   WHERE transaction_id=txid_current() AND order_id=p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kinto_approve_paid_order_v1(text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_approve_paid_order_v1(text,text,uuid,text,jsonb) TO anon, authenticated;
COMMIT;
