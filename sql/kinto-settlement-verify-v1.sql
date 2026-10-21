-- Catalog-only verification after final lockdown.
SELECT r.role,t.tab,
 has_table_privilege(r.role,'public.'||t.tab,'SELECT') direct_select,
 has_table_privilege(r.role,'public.'||t.tab,'INSERT') direct_insert,
 has_table_privilege(r.role,'public.'||t.tab,'UPDATE') direct_update,
 has_table_privilege(r.role,'public.'||t.tab,'DELETE') direct_delete,
 has_any_column_privilege(r.role,'public.'||t.tab,'SELECT') column_select,
 has_any_column_privilege(r.role,'public.'||t.tab,'INSERT') column_insert,
 has_any_column_privilege(r.role,'public.'||t.tab,'UPDATE') column_update
FROM (VALUES('anon'),('authenticated')) r(role)
CROSS JOIN (VALUES('settlements'),('delivery_settlements')) t(tab);
SELECT t.tgname,t.tgenabled,p.prosecdef
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.orders'::regclass AND t.tgname='trg_kinto_order_settlement_guard_v1';
SELECT r.role,f.signature,has_function_privilege(r.role,f.signature,'EXECUTE') session_rpc
FROM (VALUES('anon'),('authenticated')) r(role)
CROSS JOIN (VALUES
 ('public.kinto_request_settlements_session_v1(text,text,text,text,text,uuid[],text)'),
 ('public.kinto_decide_settlement_session_v1(text,text,bigint,text)'),
 ('public.kinto_cash_settle_courier_session_v1(text,text,text,uuid[],text)'),
 ('public.kinto_settlements_directory_session_v1(text,text,text,jsonb,text,boolean,integer,integer)')) f(signature);
