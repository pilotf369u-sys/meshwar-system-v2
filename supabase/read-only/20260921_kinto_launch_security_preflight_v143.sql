-- KINTO launch-security preflight V143
-- READ ONLY: this script does not create, alter, update, delete, grant, or revoke.
-- Run in Supabase SQL Editor and export/copy every result grid.

begin transaction read only;

-- 1) RLS state for operational tables.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname = any (array[
    'customers', 'employees', 'branches', 'couriers', 'orders', 'messages',
    'local_stores', 'vendors', 'order_store_segments', 'vendor_sessions',
    'settlements', 'settings'
  ])
order by c.relname;

-- 2) Policies attached to those tables (expressions only; no row data).
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'customers', 'employees', 'branches', 'couriers', 'orders', 'messages',
    'local_stores', 'vendors', 'order_store_segments', 'vendor_sessions',
    'settlements', 'settings'
  ])
order by tablename, policyname;

-- 3) Direct table privileges granted to browser-facing roles.
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name = any (array[
    'customers', 'employees', 'branches', 'couriers', 'orders', 'messages',
    'local_stores', 'vendors', 'order_store_segments', 'vendor_sessions',
    'settlements', 'settings'
  ])
order by table_name, grantee, privilege_type;

-- 4) Authentication/session-related routines and their execution mode.
select
  n.nspname as schema_name,
  p.proname as routine_name,
  p.prosecdef as security_definer,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  coalesce(array_to_string(p.proacl, E'\n'), '(default privileges)') as acl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%login%'
    or p.proname ilike '%session%'
    or p.proname ilike '%password%'
    or p.proname ilike '%auth%'
  )
order by p.proname, arguments;

-- 5) Sensitive-looking columns: names and types only, never their values.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = any (array[
    'customers', 'employees', 'branches', 'couriers', 'vendors',
    'vendor_sessions'
  ])
  and (
    column_name ilike '%password%'
    or column_name ilike '%token%'
    or column_name ilike '%secret%'
    or column_name ilike '%session%'
  )
order by table_name, ordinal_position;

rollback;
