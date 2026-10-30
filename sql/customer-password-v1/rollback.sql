-- PREPARED ONLY. Stop new calls by removing ONLY this package's RPC.
-- Preserve customer passwords, sessions and the private attempt/lockout table.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $rollback_guard$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'ROLLBACK_REQUIRES_POSTGRES'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid=to_regprocedure('public.customer_change_password_session_v1(text,text,text)')
    AND pg_get_userbyid(p.proowner)='postgres'
    AND obj_description(p.oid,'pg_proc')='KINTO password-v1 install-20261030'
    AND md5(p.prosrc)='a5e5e001a9f4962e9a5b91ed85898755') THEN
  RAISE EXCEPTION 'ROLLBACK_IDENTITY_MISMATCH';
 END IF;
END;
$rollback_guard$;
DROP FUNCTION public.customer_change_password_session_v1(text,text,text) RESTRICT;
-- No CASCADE; abort if dependencies exist. No table drops or customer data writes.
COMMIT;
