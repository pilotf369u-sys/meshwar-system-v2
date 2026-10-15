-- KINTO security follow-up: READ ONLY; never selects user rows or secrets.
-- This does not grant/revoke privileges or call business RPCs.
-- 1. High-risk public-table grants + permissive RLS.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
       has_table_privilege('anon',c.oid,'UPDATE') AS anon_update,
       has_table_privilege('anon',c.oid,'DELETE') AS anon_delete,
       EXISTS (
         SELECT 1 FROM pg_policy p
         WHERE p.polrelid=c.oid AND
           (p.polcmd='*' OR p.polcmd='r') AND
           pg_get_expr(p.polqual,p.polrelid)='true'
       ) AS unrestricted_read_policy
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('customers','orders','employees','branches','couriers','local_stores','local_products')
ORDER BY c.relname;

-- 2. Existing function exposure; checks signatures and privileges, not data.
-- Important: an actor/admin ID is NOT proof of authentication.
SELECT n.nspname AS schema_name,p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN
    ('adjust_customer_reward_balance',
     'admin_approve_featured_request',
     'admin_list_featured_requests',
     'list_featured_merchants',
     'admin_reject_featured_request')
ORDER BY p.proname;

-- 3. Sensitive credential columns: metadata ONLY.
SELECT table_name,column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('customers','employees','branches','couriers','local_stores')
  AND column_name IN ('password','password_hash')
ORDER BY table_name,column_name;

-- 4. Trigger presence for recent independent local order protections.
SELECT tgname,tgenabled
FROM pg_trigger
WHERE tgrelid='public.orders'::regclass
  AND NOT tgisinternal
  AND (tgname ILIKE '%kinto%' OR tgname ILIKE '%local%' OR tgname ILIKE '%guard%')
ORDER BY tgname;
