-- Catalog only. Expected: direct_delete false for both roles.
SELECT r.role,has_table_privilege(r.role,'public.orders','DELETE') direct_delete,
 has_table_privilege(r.role,'public.orders','SELECT') direct_select,
 has_table_privilege(r.role,'public.orders','INSERT') direct_insert,
 has_table_privilege(r.role,'public.orders','UPDATE') direct_update
FROM (VALUES('anon'),('authenticated')) r(role);
