-- KINTO external shipping fee/currency security v1.
-- Apply in Supabase SQL Editor BEFORE merging matching UI PR.
-- Does not change existing order rows or vendor shipping flows.
BEGIN;
CREATE TABLE IF NOT EXISTS private.kinto_external_shipping_audit_v1 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid NOT NULL,
 actor_type text NOT NULL CHECK(actor_type IN ('employee','admin')),
 actor_id text NOT NULL,
 previous_fee numeric,
 new_fee numeric,
 previous_currency text,
 new_currency text,
 changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.kinto_external_shipping_audit_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.kinto_external_shipping_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp AS $fn$
BEGIN
 IF NEW.external_shipping_fee IS NOT DISTINCT FROM OLD.external_shipping_fee
    AND NEW.external_shipping_currency IS NOT DISTINCT FROM OLD.external_shipping_currency
 THEN RETURN NEW; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM private.kinto_paid_transition_permits_v1 p
  WHERE p.transaction_id=txid_current() AND p.order_id=OLD.id
 ) THEN
  RAISE EXCEPTION 'KINTO_EXTERNAL_SHIPPING_APPROVAL_REQUIRED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.kinto_external_shipping_guard_v1() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_kinto_external_shipping_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_external_shipping_guard_v1
BEFORE UPDATE OF external_shipping_fee, external_shipping_currency ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.kinto_external_shipping_guard_v1();

CREATE OR REPLACE FUNCTION public.kinto_approve_external_shipping_v1(
 p_session_token text, p_actor text, p_order_id uuid,
 p_expected_status text, p_expected_fee numeric, p_expected_currency text,
 p_new_fee numeric, p_new_currency text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, pg_temp AS $fn$
DECLARE v_actor_id text; v_old public.orders%ROWTYPE;
BEGIN
 IF p_actor='employee' THEN
  v_actor_id:=private.require_employee_session_v143(p_session_token);
 ELSIF p_actor='admin' THEN
  v_actor_id:=private.require_admin_session_v147(p_session_token);
 ELSE RAISE EXCEPTION 'KINTO_EXTERNAL_SHIPPING_ACTOR_DENIED' USING ERRCODE='42501';
 END IF;
 IF v_actor_id IS NULL THEN
  RAISE EXCEPTION 'KINTO_EXTERNAL_SHIPPING_SESSION_INVALID' USING ERRCODE='42501';
 END IF;
 IF p_new_fee IS NULL OR p_new_fee < 0 OR p_new_fee > 999999999999
    OR p_new_currency IS NULL OR length(btrim(p_new_currency)) NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'KINTO_EXTERNAL_SHIPPING_VALUE_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_old FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'KINTO_ORDER_NOT_FOUND'; END IF;
 IF v_old.status IS DISTINCT FROM p_expected_status
   OR v_old.external_shipping_fee IS DISTINCT FROM p_expected_fee
   OR v_old.external_shipping_currency IS DISTINCT FROM p_expected_currency
 THEN RAISE EXCEPTION 'KINTO_EXTERNAL_SHIPPING_STALE_ORDER' USING ERRCODE='40001';
 END IF;
 IF v_old.external_shipping_fee IS NOT DISTINCT FROM p_new_fee
    AND v_old.external_shipping_currency IS NOT DISTINCT FROM p_new_currency
 THEN RETURN; END IF;
 INSERT INTO private.kinto_paid_transition_permits_v1(transaction_id,order_id)
 VALUES(txid_current(),p_order_id);
 UPDATE public.orders SET external_shipping_fee=p_new_fee,
   external_shipping_currency=p_new_currency WHERE id=p_order_id;
 INSERT INTO private.kinto_external_shipping_audit_v1(
  order_id,actor_type,actor_id,previous_fee,new_fee,previous_currency,new_currency
 ) VALUES(p_order_id,p_actor,v_actor_id,v_old.external_shipping_fee,p_new_fee,
   v_old.external_shipping_currency,p_new_currency);
 DELETE FROM private.kinto_paid_transition_permits_v1
 WHERE transaction_id=txid_current() AND order_id=p_order_id;
END $fn$;
REVOKE ALL ON FUNCTION public.kinto_approve_external_shipping_v1(text,text,uuid,text,numeric,text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_approve_external_shipping_v1(text,text,uuid,text,numeric,text,numeric,text) TO anon,authenticated;
COMMIT;
