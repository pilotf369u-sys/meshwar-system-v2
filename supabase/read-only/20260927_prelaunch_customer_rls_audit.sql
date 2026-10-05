-- KINTO pre-launch security audit (READ ONLY)
-- No DDL/DML. Safe to run in Supabase SQL Editor.
select n.nspname schema_name,c.relname table_name,c.relrowsecurity rls_enabled,c.relforcerowsecurity rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('customers','orders','messages') order by c.relname;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('customers','orders','messages')
order by tablename,policyname;

select table_schema,table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('customers','orders','messages')
and grantee in ('anon','authenticated','public')
order by table_name,grantee,privilege_type;

select routine_schema,routine_name,grantee,privilege_type
from information_schema.role_routine_grants
where routine_schema='public'
and routine_name in ('customer_review_login_v132','customer_review_logout_v132','customer_session_identity_v150')
and grantee in ('anon','authenticated','public')
order by routine_name,grantee;