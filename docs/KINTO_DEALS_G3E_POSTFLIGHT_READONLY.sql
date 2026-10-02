-- G3E one-result READ ONLY postflight, after manual migration.
with checks as (
 select 'admin_detail_definer' name,coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_admin_detail_g3(text,uuid)'::regprocedure),false) ok
 union all select 'admin_detail_execute_granted',
 has_function_privilege('anon','public.kinto_deals_v1_admin_detail_g3(text,uuid)','EXECUTE')
 and has_function_privilege('authenticated','public.kinto_deals_v1_admin_detail_g3(text,uuid)','EXECUTE')
 union all select 'feature_still_off',not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),true)
 union all select 'products_no_browser_select',not has_table_privilege('anon','public.kinto_deals_v1_products','SELECT') and not has_table_privilege('authenticated','public.kinto_deals_v1_products','SELECT')
 union all select 'campaigns_no_browser_select',not has_table_privilege('anon','public.kinto_deals_v1_campaigns','SELECT') and not has_table_privilege('authenticated','public.kinto_deals_v1_campaigns','SELECT')
 union all select 'no_deals_order_triggers',not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname like '%deals%')
)
select name,ok from checks order by name;
