-- G4D read-only postflight: one result set.
with checks as (
 select 'draft_restore_definer' name,coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_vendor_drafts_g4(text,uuid,integer)'::regprocedure),false) ok
 union all select 'draft_restore_execute',has_function_privilege('anon','public.kinto_deals_v1_vendor_drafts_g4(text,uuid,integer)','EXECUTE') and has_function_privilege('authenticated','public.kinto_deals_v1_vendor_drafts_g4(text,uuid,integer)','EXECUTE')
 union all select 'feature_still_off',not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),true)
 union all select 'no_browser_campaign_read',not has_table_privilege('anon','public.kinto_deals_v1_campaigns','SELECT') and not has_table_privilege('authenticated','public.kinto_deals_v1_campaigns','SELECT')
 union all select 'no_browser_products_read',not has_table_privilege('anon','public.kinto_deals_v1_products','SELECT') and not has_table_privilege('authenticated','public.kinto_deals_v1_products','SELECT')
 union all select 'no_deals_order_triggers',not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname like '%deals%')
)
select name,ok from checks order by name;
