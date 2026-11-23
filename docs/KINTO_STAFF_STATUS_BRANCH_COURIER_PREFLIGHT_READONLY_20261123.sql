-- KINTO staff save: READ-ONLY preflight for branch transfer and courier status.
-- Returns metadata only; never edits orders, functions, privileges or triggers.
WITH target AS (
  SELECT 'public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)'::regprocedure AS fn
),
function_checks AS (
  SELECT 'function'::text AS kind, 'staff_order_save'::text AS object_name,
    jsonb_build_object(
      'md5', md5(pg_get_functiondef(fn)),
      'branch_transfer_literal_present', position('محولة إلى الفرع' in pg_get_functiondef(fn))>0,
      'courier_literal_present', position('مندوب' in pg_get_functiondef(fn))>0,
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'search_path', p.proconfig
    ) AS details
  FROM target JOIN pg_proc p ON p.oid=target.fn
),
order_constraints AS (
  SELECT 'constraint'::text AS kind,c.conname::text AS object_name,
    jsonb_build_object('type',c.contype,'definition',pg_get_constraintdef(c.oid)) AS details
  FROM pg_constraint c
  WHERE c.conrelid='public.orders'::regclass
    AND (pg_get_constraintdef(c.oid) ILIKE '%status%' OR pg_get_constraintdef(c.oid) ILIKE '%branch%')
),
order_triggers AS (
  SELECT 'trigger'::text AS kind,t.tgname::text AS object_name,
    jsonb_build_object('enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) AS details
  FROM pg_trigger t
  WHERE t.tgrelid='public.orders'::regclass
    AND NOT t.tgisinternal
    AND (pg_get_triggerdef(t.oid) ILIKE '%UPDATE%'
      OR t.tgname ILIKE '%branch%' OR t.tgname ILIKE '%status%')
)
SELECT * FROM function_checks
UNION ALL SELECT * FROM order_constraints
UNION ALL SELECT * FROM order_triggers
ORDER BY kind,object_name;
