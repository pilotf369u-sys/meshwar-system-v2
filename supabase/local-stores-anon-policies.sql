-- EMERGENCY permissive RLS policies for Local Stores.
-- WARNING: anon full access is intentionally broad and should be replaced by authenticated admin/store policies later.
ALTER TABLE public.local_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access" ON public.local_stores;
CREATE POLICY "Allow anon full access" ON public.local_stores FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon full access" ON public.local_products;
CREATE POLICY "Allow anon full access" ON public.local_products FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon full access" ON public.local_orders;
CREATE POLICY "Allow anon full access" ON public.local_orders FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon full access" ON public.local_returns;
CREATE POLICY "Allow anon full access" ON public.local_returns FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_stores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_returns TO anon;
GRANT SELECT ON public.local_store_financial_summary TO anon;
