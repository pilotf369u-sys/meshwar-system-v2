-- KINTO IQD250: READ-ONLY pre-release check of legacy browser order insertion path.
-- No modifications or execution of checkout functions.
-- SQL Editor: run query; verify trigger is present and enabled before price release.
SELECT
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_code,
  pg_get_triggerdef(t.oid) AS trigger_definition,
  n.nspname||'.'||p.proname AS trigger_function
FROM pg_trigger t
JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE t.tgrelid='public.orders'::regclass
AND NOT t.tgisinternal
AND (t.tgname ILIKE '%insert_gate%' OR t.tgname ILIKE '%session_write_guard%')
ORDER BY t.tgname;

-- Query 2: check whether supported policies are present. No customers or order records are read.
SELECT policyname, cmd, roles, permissive
FROM pg_policies
WHERE schemaname='public' AND tablename='orders' AND cmd='INSERT'
ORDER BY policyname;
