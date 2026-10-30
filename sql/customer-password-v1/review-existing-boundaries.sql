-- READ ONLY: collect prerequisite authorization metadata, never customer/session rows.
-- A human must review this report before installation; existence/owner alone is insufficient.
BEGIN READ ONLY;
SELECT r.rolname,r.rolsuper,r.rolbypassrls,
 has_column_privilege(r.rolname,'public.customers','password','SELECT') AS can_read_password_column,
 has_column_privilege(r.rolname,'public.customers','password','UPDATE') AS can_update_password_column,
 has_table_privilege(r.rolname,'public.customer_review_sessions','SELECT') AS session_select,
 has_any_column_privilege(r.rolname,'public.customer_review_sessions','INSERT') AS session_insert,
 has_any_column_privilege(r.rolname,'public.customer_review_sessions','UPDATE') AS session_update,
 has_table_privilege(r.rolname,'public.customer_review_sessions','DELETE') AS session_delete
FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated');
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('customers','customer_review_sessions');
SELECT n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,
 ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END FROM unnest(p.polroles) role_id) AS roles,
 pg_get_expr(p.polqual,p.polrelid) AS using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('customers','customer_review_sessions');
SELECT pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,md5(p.prosrc) AS helper_body_fingerprint
FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('private.require_customer_review_session(text)');
COMMIT;
