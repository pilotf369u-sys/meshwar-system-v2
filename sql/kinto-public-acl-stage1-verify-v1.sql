-- KINTO ACL Stage 1 verification - READ ONLY.
-- Expected: 0 rows after applying stage1 migration.
WITH scope(table_name) AS (
  VALUES ('agents'),
         ('app_settings'),
         ('cart_items'),
         ('carts'),
         ('currencies'),
         ('delivery_settlements'),
         ('financial_settlements'),
         ('local_orders'),
         ('local_products'),
         ('local_returns'),
         ('merchant_featured_requests'),
         ('merchant_featured_slots'),
         ('products'),
         ('profiles'),
         ('settlement_reports'),
         ('site_content'),
         ('staff'),
         ('store_categories'),
         ('store_category_media'),
         ('stores'),
         ('vendor_financial_settlements'),
         ('vendor_operating_expenses'),
         ('vendor_settlement_archives_v163')
), roles(role_name) AS (VALUES ('anon'),('authenticated')),
privileges(privilege_name) AS (VALUES ('TRUNCATE'),('TRIGGER'),('REFERENCES'))
SELECT s.table_name,r.role_name,p.privilege_name
FROM scope s CROSS JOIN roles r CROSS JOIN privileges p
WHERE has_table_privilege(r.role_name,format('public.%I',s.table_name),p.privilege_name)
ORDER BY 1,2,3;

-- The following remains a SEPARATE, UNRESOLVED high-priority issue:
-- broad anon/authenticated SELECT/UPDATE/DELETE grants + permissive RLS.
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('anon',c.oid,'UPDATE') AS anon_update,
       has_table_privilege('anon',c.oid,'DELETE') AS anon_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('customers','orders','local_stores','local_products','employees','branches','couriers','local_orders','local_returns')
ORDER BY c.relname;
