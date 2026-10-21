-- Catalog only. Expected: enabled O, security_definer false; both RPC grants true.
SELECT t.tgname,t.tgenabled,p.prosecdef AS security_definer
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.orders'::regclass AND t.tgname='trg_kinto_order_price_api_guard_v1';
SELECT r.role,has_function_privilege(r.role,
 'public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)','EXECUTE') session_rpc
FROM (VALUES('anon'),('authenticated')) r(role);
