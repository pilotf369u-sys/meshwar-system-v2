-- PREPARED ONLY. No production execution is authorized by this file.
-- Run the WHOLE transaction as postgres, with stop-on-error. Never run fragments.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE s text; r text;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'INSTALL_REQUIRES_POSTGRES'; END IF;
 IF to_regclass('private.customer_password_change_attempts_v1') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='customer_change_password_session_v1') THEN
  RAISE EXCEPTION 'INSTALL_OBJECT_ALREADY_EXISTS';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
                WHERE c.oid=to_regclass('public.customers') AND c.relkind='r' AND c.relrowsecurity AND r.rolname='postgres')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
                   WHERE p.oid=to_regprocedure('private.require_customer_review_session(text)')
                     AND p.prorettype='uuid'::regtype AND p.prosecdef AND r.rolname='postgres')
    OR to_regprocedure('extensions.crypt(text,text)') IS NULL
    OR to_regprocedure('extensions.gen_salt(text)') IS NULL THEN
  RAISE EXCEPTION 'INSTALL_DEPENDENCY_MISMATCH';
 END IF;
 FOREACH s IN ARRAY ARRAY['public','private','extensions'] LOOP
  IF to_regnamespace(s) IS NULL THEN RAISE EXCEPTION 'INSTALL_SCHEMA_MISSING'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=r) THEN RAISE EXCEPTION 'INSTALL_ROLE_MISSING'; END IF;
   IF s='public' AND NOT has_schema_privilege(r,s,'USAGE') THEN RAISE EXCEPTION 'INSTALL_PUBLIC_USAGE_MISSING'; END IF;
   IF has_schema_privilege(r,s,'CREATE') THEN RAISE EXCEPTION 'INSTALL_UNTRUSTED_SCHEMA_CREATE'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n,
             LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
             WHERE n.nspname=s AND a.grantee=0 AND a.privilege_type='CREATE') THEN
   RAISE EXCEPTION 'INSTALL_PUBLIC_SCHEMA_CREATE';
  END IF;
 END LOOP;
END;
$preflight$;

CREATE TABLE private.customer_password_change_attempts_v1 (
 customer_id uuid PRIMARY KEY,
 failed_attempts integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz
);
ALTER TABLE private.customer_password_change_attempts_v1 ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.customer_change_password_session_v1(
  p_session_token text, p_current_password text, p_new_password text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
-- SECURITY DEFINER: resolve unqualified names only from trusted system catalog.
-- Application tables/functions and pgcrypto calls use explicit schema qualification.
SET search_path = pg_catalog, pg_temp
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
  IF p_current_password IS NULL OR p_new_password IS NULL
     OR length(coalesce(p_current_password,'')) = 0
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
-- Remove privileges inherited from default ACLs on these NEW objects only.
-- Do not modify schema grants, default privileges, customers, sessions or helpers.
DO $new_acl$
DECLARE x record;
BEGIN
 REVOKE ALL ON TABLE private.customer_password_change_attempts_v1 FROM PUBLIC;
 FOR x IN SELECT DISTINCT a.grantee FROM pg_catalog.pg_class c,
           LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
           WHERE c.oid='private.customer_password_change_attempts_v1'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE private.customer_password_change_attempts_v1 FROM %I',pg_get_userbyid(x.grantee));
 END LOOP;
 REVOKE ALL ON FUNCTION public.customer_change_password_session_v1(text,text,text) FROM PUBLIC;
 FOR x IN SELECT DISTINCT a.grantee FROM pg_catalog.pg_proc p,
           LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
           WHERE p.oid='public.customer_change_password_session_v1(text,text,text)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.customer_change_password_session_v1(text,text,text) FROM %I',pg_get_userbyid(x.grantee));
 END LOOP;
END;
$new_acl$;
GRANT EXECUTE ON FUNCTION public.customer_change_password_session_v1(text,text,text) TO anon,authenticated;
COMMENT ON TABLE private.customer_password_change_attempts_v1 IS 'KINTO password-v1 install-20261030';
COMMENT ON FUNCTION public.customer_change_password_session_v1(text,text,text) IS 'KINTO password-v1 install-20261030';
-- No NOTIFY/reload or web deployment. API visibility is a separate controlled step.
COMMIT;
