-- KINTO customer password change PROPOSAL ONLY; deliberately not a migration.
-- Do NOT deploy or merge until isolated PostgreSQL authorization/rate-limit tests pass.
-- Isolated to customer password; no login, orders, checkout, inventory, or WhatsApp changes.
BEGIN;

-- Failed-password counters are private; this is NOT exposed through the data API.
CREATE TABLE IF NOT EXISTS private.customer_password_change_attempts_v1 (
  customer_id uuid PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
REVOKE ALL ON TABLE private.customer_password_change_attempts_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.customer_change_password_session_v1(
  p_session_token text, p_current_password text, p_new_password text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions, pg_temp
AS $$
DECLARE
  v_customer uuid;
  v_stored text;
  v_match boolean := false;
  v_attempts integer;
  v_window timestamptz;
  v_locked timestamptz;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Fail closed before touching the account row; never echo passwords.
  IF length(coalesce(p_current_password,'')) = 0
     OR octet_length(coalesce(p_new_password,'')) < 8
     OR octet_length(p_new_password) > 72
     OR p_current_password = p_new_password THEN
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_INPUT_INVALID');
  END IF;
  v_customer := private.require_customer_review_session(p_session_token);
  -- Serialize attempts and password changes across sessions for this customer.
  SELECT password INTO v_stored FROM public.customers WHERE id = v_customer FOR UPDATE;
  IF v_stored IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_INVALID');
  END IF;
  INSERT INTO private.customer_password_change_attempts_v1(customer_id,failed_attempts,window_start)
  VALUES(v_customer,0,v_now) ON CONFLICT (customer_id) DO NOTHING;
  SELECT failed_attempts,window_start,locked_until
    INTO v_attempts,v_window,v_locked
    FROM private.customer_password_change_attempts_v1
    WHERE customer_id=v_customer FOR UPDATE;
  IF v_locked IS NOT NULL AND v_locked > v_now THEN
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_CHANGE_TEMPORARILY_LOCKED');
  END IF;
  IF v_window < v_now - interval '15 minutes' THEN
    v_attempts := 0;
    v_window := v_now;
  END IF;
  IF left(v_stored,4) IN ('$2a$','$2b$','$2y$') THEN
    v_match := extensions.crypt(p_current_password,v_stored) = v_stored;
  ELSE
    -- Current login accepts legacy plaintext; upgrade this account only on success.
    v_match := v_stored = p_current_password;
  END IF;
  IF NOT v_match THEN
    UPDATE private.customer_password_change_attempts_v1 SET
      failed_attempts=v_attempts+1,
      window_start=v_window,
      locked_until=CASE WHEN v_attempts+1 >= 5
                        THEN v_now+interval '15 minutes' ELSE NULL END
    WHERE customer_id=v_customer;
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_INVALID');
  END IF;
  UPDATE public.customers
    SET password=extensions.crypt(p_new_password,extensions.gen_salt('bf'))
    WHERE id=v_customer;
  DELETE FROM private.customer_password_change_attempts_v1 WHERE customer_id=v_customer;
  -- Do not change login/session duration, revocations, or other customer fields.
  RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.customer_change_password_session_v1(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_change_password_session_v1(text,text,text) TO anon, authenticated;
COMMIT;
