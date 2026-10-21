-- KINTO payment collection mode protection v1.
-- Deploy before merging the corresponding frontend PR.
-- No existing order rows are changed.
BEGIN;

CREATE TABLE IF NOT EXISTS private.kinto_payment_type_change_audit_v1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('employee','admin')),
  actor_id text NOT NULL,
  previous_type text,
  new_type text NOT NULL,
  order_status text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.kinto_payment_type_change_audit_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.kinto_payment_type_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp
AS $fn$
BEGIN
  IF NEW.delivery_payment_type IS NOT DISTINCT FROM OLD.delivery_payment_type THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.kinto_paid_transition_permits_v1 p
    WHERE p.transaction_id = txid_current() AND p.order_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_TYPE_APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.kinto_payment_type_guard_v1() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_kinto_payment_type_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_payment_type_guard_v1
BEFORE UPDATE OF delivery_payment_type ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_payment_type_guard_v1();

CREATE OR REPLACE FUNCTION public.kinto_approve_payment_type_v1(
  p_session_token text,
  p_actor text,
  p_order_id uuid,
  p_expected_status text,
  p_expected_type text,
  p_new_type text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp
AS $fn$
DECLARE
  v_actor_id text;
  v_old public.orders%ROWTYPE;
BEGIN
  IF p_actor = 'employee' THEN
    v_actor_id := private.require_employee_session_v143(p_session_token);
  ELSIF p_actor = 'admin' THEN
    v_actor_id := private.require_admin_session_v147(p_session_token);
  ELSE
    RAISE EXCEPTION 'KINTO_PAYMENT_TYPE_ACTOR_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_TYPE_SESSION_INVALID' USING ERRCODE = '42501';
  END IF;
  IF p_new_type IS NULL OR p_new_type NOT IN (
    'cod_full','product_paid_delivery_cod','paid_prepaid'
  ) THEN
    RAISE EXCEPTION 'KINTO_PAYMENT_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KINTO_ORDER_NOT_FOUND'; END IF;
  IF v_old.status IS DISTINCT FROM p_expected_status OR
     v_old.delivery_payment_type IS DISTINCT FROM p_expected_type THEN
    RAISE EXCEPTION 'KINTO_ORDER_PAYMENT_TYPE_CHANGED';
  END IF;
  IF v_old.delivery_payment_type IS NOT DISTINCT FROM p_new_type THEN
    RETURN;
  END IF;
  INSERT INTO private.kinto_paid_transition_permits_v1(transaction_id,order_id)
  VALUES(txid_current(),p_order_id);
  UPDATE public.orders SET delivery_payment_type = p_new_type WHERE id = p_order_id;
  INSERT INTO private.kinto_payment_type_change_audit_v1(
    order_id,actor_type,actor_id,previous_type,new_type,order_status
  ) VALUES(p_order_id,p_actor,v_actor_id,v_old.delivery_payment_type,p_new_type,v_old.status);
  DELETE FROM private.kinto_paid_transition_permits_v1
  WHERE transaction_id = txid_current() AND order_id = p_order_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.kinto_approve_payment_type_v1(text,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_approve_payment_type_v1(text,text,uuid,text,text,text) TO anon, authenticated;
COMMIT;
