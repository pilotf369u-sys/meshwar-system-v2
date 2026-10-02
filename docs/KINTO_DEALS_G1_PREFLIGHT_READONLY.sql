-- G1 READ-ONLY preflight. Run BEFORE the migration. Does not create/alter data.
-- Every result must be inspected; expected store/product/customer/order IDs: uuid.
select c.table_name,c.column_name,c.data_type,c.udt_name
from information_schema.columns c
where c.table_schema='public'
  and (c.table_name,c.column_name) in (
    ('local_stores','id'),('local_products','id'),('local_products','store_id'),
    ('customers','id'),('orders','id')
  )
order by c.table_name,c.column_name;

-- Fail-safe: existing namespace must be absent or manually reconciled.
select table_name from information_schema.tables
where table_schema='public' and table_name like 'kinto_deals_v1_%'
order by table_name;

-- Existing campaign v411 must remain distinct from merchant DEALS.
select to_regclass('public.kinto_campaigns') as existing_admin_campaigns,
       to_regclass('public.orders') as canonical_orders;

-- AFTER migration, expected 5 DEALS tables and feature flag false:
-- select * from public.kinto_deals_v1_flags; -- run as SQL editor owner only.
-- select tablename,rowsecurity from pg_tables where schemaname='public'
-- and tablename like 'kinto_deals_v1_%' order by tablename;
