BEGIN;

CREATE OR REPLACE FUNCTION public.vendor_add_operating_expense(
  p_store_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_expense_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.vendor_operating_expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vendor_operating_expenses;
BEGIN
  IF p_store_id IS NULL OR btrim(p_store_id) = '' THEN
    RAISE EXCEPTION 'Store id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero';
  END IF;

  INSERT INTO public.vendor_operating_expenses(
    store_id, amount, currency, category, note, expense_date
  ) VALUES (
    btrim(p_store_id),
    p_amount,
    NULLIF(btrim(COALESCE(p_currency,'')),''),
    COALESCE(NULLIF(btrim(COALESCE(p_category,'')),''),'تشغيلي'),
    NULLIF(btrim(COALESCE(p_note,'')),''),
    COALESCE(p_expense_date,CURRENT_DATE)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_add_operating_expense(TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_add_operating_expense(TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE) TO anon, authenticated;

COMMIT;
