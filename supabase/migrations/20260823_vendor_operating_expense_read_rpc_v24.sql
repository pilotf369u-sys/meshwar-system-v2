-- MeshWar V24: secure operating-expense re-fetch for the vendor P&L UI.
-- Read-only RPC; no existing rows are modified.
BEGIN;

CREATE OR REPLACE FUNCTION public.vendor_get_operating_expenses(
  p_store_id TEXT
)
RETURNS SETOF public.vendor_operating_expenses
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.*
  FROM public.vendor_operating_expenses e
  WHERE e.store_id = btrim(p_store_id)
  ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC;
$$;

REVOKE ALL
ON FUNCTION public.vendor_get_operating_expenses(TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.vendor_get_operating_expenses(TEXT)
TO anon, authenticated;

COMMIT;
