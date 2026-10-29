-- KINTO customer password change: PROPOSAL ONLY. Do not apply to production until isolated SQL and UI tests pass.
-- Separate from profile changes, login, checkout, order/stock and WhatsApp OTP.
-- BLOCKER: do not deploy until failed-password rate limiting and isolated PostgreSQL tests are proven.
BEGIN;
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
BEGIN
  IF length(coalesce(p_current_password,'')) = 0
     OR length(coalesce(p_new_password,'')) < 8
     OR length(p_new_password) > 128
     OR p_current_password = p_new_password THEN
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_INPUT_INVALID');
  END IF;
  v_customer := private.require_customer_review_session(p_session_token);
  SELECT password INTO v_stored FROM public.customers WHERE id = v_customer FOR UPDATE;
  IF v_stored IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_INVALID');
  END IF;
  IF v_stored ~ '^\\$2[aby]\\$' THEN
    v_match := extensions.crypt(p_current_password,v_stored) = v_stored;
  ELSE
    -- Existing login still supports legacy plaintext records; upgrade only this account on success.
    v_match := v_stored = p_current_password;
  END IF;
  IF NOT v_match THEN
    RETURN jsonb_build_object('ok',false,'error','PASSWORD_INVALID');
  END IF;
  UPDATE public.customers
    SET password=extensions.crypt(p_new_password,extensions.gen_salt('bf'))
    WHERE id=v_customer;
  -- Revoke other sessions; keep the current verified session to avoid disrupting active checkout.
  UPDATE public.customer_review_sessions
    SET revoked_at=now()
    WHERE customer_id=v_customer
      AND token_hash <> extensions.digest(p_session_token,'sha256')
      AND revoked_at IS NULL;
  RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.customer_change_password_session_v1(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_change_password_session_v1(text,text,text) TO anon,authenticated;
COMMIT;
