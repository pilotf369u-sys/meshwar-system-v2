-- G4A: one-result READ ONLY postflight after manual SQL.
with checks as (
 select 'vendor_picker_definer' name,coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_vendor_products_g4(text,text,integer)'::regprocedure),false) ok
 union all select 'vendor_picker_execute',has_function_privilege('anon','public.kinto_deals_v1_vendor_products_g4(text,text,integer)','EXECUTE') and has_function_privilege('authenticated','public.kinto_deals_v1_vendor_products_g4(text,text,integer)','EXECUTE')
 union all select 'flag_still_off',not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),true)
 union all select 'no_deals_order_triggers',not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname like '%deals%')
 union all select 'no_browser_deals_product_read',not has_table_privilege('anon','public.kinto_deals_v1_products','SELECT') and not has_table_privilege('authenticated','public.kinto_deals_v1_products','SELECT')
)
select name,ok from checks order by name;
