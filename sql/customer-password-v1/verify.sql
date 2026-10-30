-- READ ONLY. Run as postgres after installation; assertions return no customer data.
BEGIN READ ONLY;
DO $verify$
DECLARE r text; privilege text; s text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid=to_regprocedure('public.customer_change_password_session_v1(text,text,text)')
   AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef
   AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
   AND obj_description(p.oid,'pg_proc')='KINTO password-v1 install-20261030'
   AND md5(replace(p.prosrc, E'\r\n', E'\n'))='a5e5e001a9f4962e9a5b91ed85898755') THEN RAISE EXCEPTION 'VERIFY_RPC_SECURITY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
  WHERE c.oid=to_regclass('private.customer_password_change_attempts_v1')
   AND pg_get_userbyid(c.relowner)='postgres' AND c.relrowsecurity
   AND obj_description(c.oid,'pg_class')='KINTO password-v1 install-20261030') THEN RAISE EXCEPTION 'VERIFY_TABLE_SECURITY'; END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p,
  LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='public.customer_change_password_session_v1(text,text,text)'::regprocedure
   AND (a.grantee=0 OR pg_get_userbyid(a.grantee) NOT IN ('postgres','anon','authenticated')
        OR (a.grantee<>p.proowner AND a.is_grantable))) THEN RAISE EXCEPTION 'VERIFY_RPC_ACL'; END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c,
  LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='private.customer_password_change_attempts_v1'::regclass AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'VERIFY_TABLE_ACL'; END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='private.customer_password_change_attempts_v1'::regclass) THEN RAISE EXCEPTION 'VERIFY_UNEXPECTED_POLICY'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF NOT has_function_privilege(r,'public.customer_change_password_session_v1(text,text,text)','EXECUTE')
     OR NOT has_schema_privilege(r,'public','USAGE') THEN RAISE EXCEPTION 'VERIFY_RPC_CALLER'; END IF;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
   IF has_table_privilege(r,'private.customer_password_change_attempts_v1',privilege) THEN RAISE EXCEPTION 'VERIFY_PRIVATE_TABLE_ACCESS'; END IF;
  END LOOP;
  FOREACH s IN ARRAY ARRAY['public','private','extensions'] LOOP
   IF has_schema_privilege(r,s,'CREATE') THEN RAISE EXCEPTION 'VERIFY_SCHEMA_CREATE'; END IF;
  END LOOP;
 END LOOP;
END;
$verify$;
SELECT 'PASSWORD_V1_VERIFY_OK' AS result;
COMMIT;
