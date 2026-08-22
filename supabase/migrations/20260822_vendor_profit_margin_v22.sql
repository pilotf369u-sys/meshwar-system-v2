-- MeshWar Vendor Auto Pricing V22
-- Adds only the optional global profit margin setting. Exchange-rate schema/RPCs are untouched.

BEGIN;

ALTER TABLE public.local_stores
  ADD COLUMN IF NOT EXISTS profit_margin_percent NUMERIC(7,3) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'local_stores_profit_margin_percent_range'
  ) THEN
    ALTER TABLE public.local_stores
      ADD CONSTRAINT local_stores_profit_margin_percent_range
      CHECK (
        profit_margin_percent IS NULL
        OR (profit_margin_percent >= 0 AND profit_margin_percent <= 10000)
      );
  END IF;
END $$;

-- Read only the pricing-margin setting for the current vendor store.
CREATE OR REPLACE FUNCTION public.vendor_get_profit_margin(p_store_id TEXT)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.profit_margin_percent
  FROM public.local_stores s
  WHERE s.id::text = p_store_id
  LIMIT 1;
$$;

-- Independent setter: does not call or modify vendor_set_exchange_rate.
CREATE OR REPLACE FUNCTION public.vendor_set_profit_margin(
  p_store_id TEXT,
  p_margin NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_margin NUMERIC;
BEGIN
  IF p_margin IS NULL OR p_margin < 0 OR p_margin > 10000 THEN
    RAISE EXCEPTION 'Profit margin must be between 0 and 10000 percent';
  END IF;

  UPDATE public.local_stores
  SET profit_margin_percent = p_margin
  WHERE id::text = p_store_id
  RETURNING profit_margin_percent INTO v_margin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found';
  END IF;

  RETURN v_margin;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_get_profit_margin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendor_set_profit_margin(TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_get_profit_margin(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_set_profit_margin(TEXT, NUMERIC) TO anon, authenticated;

COMMIT;
