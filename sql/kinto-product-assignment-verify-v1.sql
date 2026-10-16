-- Catalog only: product writes false, public reads true; assignment guard enabled O/invoker.
SELECT r.role,has_table_privilege(r.role,'public.local_products','SELECT') public_read,
 has_table_privilege(r.role,'public.local_products','INSERT') direct_insert,
 has_table_privilege(r.role,'public.local_products','UPDATE') direct_update,
 has_table_privilege(r.role,'public.local_products','DELETE') direct_delete,
 has_any_column_privilege(r.role,'public.local_products','INSERT') column_insert,
 has_any_column_privilege(r.role,'public.local_products','UPDATE') column_update
FROM (VALUES('anon'),('authenticated')) r(role);
SELECT t.tgname,t.tgenabled,p.prosecdef FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.orders'::regclass AND t.tgname='trg_kinto_order_assignment_api_guard_v1';
SELECT has_function_privilege('anon','public.kinto_vendor_product_write_session_v1(text,text,uuid,jsonb,jsonb)','EXECUTE') product_rpc,
 has_function_privilege('anon','public.kinto_save_branch_orders_session_v1(text,text,text,jsonb,jsonb)','EXECUTE') assignment_rpc;
