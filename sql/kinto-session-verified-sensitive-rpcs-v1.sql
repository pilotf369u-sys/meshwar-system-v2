-- KINTO session-bound replacements for legacy ID-trusting SECURITY DEFINER RPCs.
-- Manual deployment, after isolated DB testing. Does not alter existing functions/data.
-- Deploy BEFORE deploying the UI that calls these functions.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_list_featured_requests_session_v1(p_session_token text)
RETURNS SETOF public.merchant_featured_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := (private.require_admin_session_v147(p_session_token))::uuid;
  IF NOT public.meshwar_is_admin(v_admin) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_list_featured_requests(v_admin);
END $$;

CREATE OR REPLACE FUNCTION public.list_featured_merchants_session_v1(p_session_token text)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := (private.require_admin_session_v147(p_session_token))::uuid;
  IF NOT public.meshwar_is_admin(v_admin) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT * FROM public.list_featured_merchants(v_admin);
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_featured_request_session_v1(
  p_session_token text, p_request_id uuid, p_store_id uuid,
  p_start_date timestamptz, p_end_date timestamptz, p_admin_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := (private.require_admin_session_v147(p_session_token))::uuid;
  IF NOT public.meshwar_is_admin(v_admin) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN public.admin_approve_featured_request(v_admin,p_request_id,p_store_id,
                                                p_start_date,p_end_date,p_admin_note);
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_featured_request_session_v1(
  p_session_token text, p_request_id uuid, p_admin_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE v_admin uuid;
BEGIN
  v_admin := (private.require_admin_session_v147(p_session_token))::uuid;
  IF NOT public.meshwar_is_admin(v_admin) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN public.admin_reject_featured_request(v_admin,p_request_id,p_admin_note);
END $$;

-- Employee reward adjustment: derive actor ID only from a verified employee session.
CREATE OR REPLACE FUNCTION public.adjust_customer_reward_balance_employee_session_v1(
  p_session_token text,p_customer_id uuid,p_amount numeric,p_currency text,p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE v_employee text;
BEGIN
  v_employee := private.require_employee_session_v143(p_session_token);
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id::text=v_employee AND e.is_active IS TRUE) THEN
    RAISE EXCEPTION 'EMPLOYEE_INACTIVE' USING ERRCODE='42501';
  END IF;
  RETURN public.adjust_customer_reward_balance(p_customer_id,p_amount,p_currency,v_employee,p_note);
END $$;

-- Admin reward adjustment: derive actor ID only from a verified admin session.
CREATE OR REPLACE FUNCTION public.adjust_customer_reward_balance_admin_session_v1(
  p_session_token text,p_customer_id uuid,p_amount numeric,p_currency text,p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE v_admin text;
BEGIN
  v_admin := private.require_admin_session_v147(p_session_token);
  IF NOT public.meshwar_is_admin(v_admin::uuid) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN public.adjust_customer_reward_balance(p_customer_id,p_amount,p_currency,v_admin,p_note);
END $$;

-- Explicitly limit EXECUTE to API roles; these endpoints require verified sessions.
REVOKE ALL ON FUNCTION
  public.admin_list_featured_requests_session_v1(text),
  public.list_featured_merchants_session_v1(text),
  public.admin_approve_featured_request_session_v1(text,uuid,uuid,timestamptz,timestamptz,text),
  public.admin_reject_featured_request_session_v1(text,uuid,text),
  public.adjust_customer_reward_balance_employee_session_v1(text,uuid,numeric,text,text),
  public.adjust_customer_reward_balance_admin_session_v1(text,uuid,numeric,text,text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.admin_list_featured_requests_session_v1(text),
  public.list_featured_merchants_session_v1(text),
  public.admin_approve_featured_request_session_v1(text,uuid,uuid,timestamptz,timestamptz,text),
  public.admin_reject_featured_request_session_v1(text,uuid,text),
  public.adjust_customer_reward_balance_employee_session_v1(text,uuid,numeric,text,text),
  public.adjust_customer_reward_balance_admin_session_v1(text,uuid,numeric,text,text)
TO anon, authenticated;
COMMIT;
