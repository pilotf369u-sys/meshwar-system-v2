-- Read-only verification after activation: effective public cost false, all three restrictive policies present.
SELECT r.role,has_column_privilege(r.role,'public.local_products','cost_price','SELECT') public_cost,
 has_column_privilege(r.role,'public.local_products','product_name','SELECT') public_product_name,
 has_column_privilege(r.role,'public.local_products','stock_quantity','SELECT') public_stock
FROM (VALUES('anon'),('authenticated')) r(role);
SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename='orders' AND policyname LIKE 'kinto_order_session_%';
SELECT t.tgname,t.tgenabled,p.prosecdef FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE t.tgrelid='public.orders'::regclass AND t.tgname IN ('trg_kinto_order_session_write_guard_v1','trg_kinto_order_assignment_api_guard_v1');
SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') api_execute
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('kinto_vendor_products_read_session_v1','kinto_vendor_orders_read_session_v1','kinto_checkout_session_v1','checkout_independent_vendor_orders','checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders_v161','customer_portal_data','customer_portal_data_v2','vendor_close_financial_period');
-- Table SELECT remains granted intentionally: row security enforces sessions, including raw direct requests.
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT set_config('request.headers','{}',true);
SELECT count(*) AS anonymous_visible_orders FROM public.orders;
ROLLBACK;
