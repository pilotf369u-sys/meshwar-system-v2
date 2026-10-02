-- G4B consolidated READ ONLY postflight (no test inserts).
with checks as (
 select 'draft_definer' name,coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_vendor_save_draft_g4(text,uuid,timestamptz,jsonb)'::regprocedure),false) ok
 union all select 'draft_execute_granted',has_function_privilege('anon','public.kinto_deals_v1_vendor_save_draft_g4(text,uuid,timestamptz,jsonb)','EXECUTE') and has_function_privilege('authenticated','public.kinto_deals_v1_vendor_save_draft_g4(text,uuid,timestamptz,jsonb)','EXECUTE')
 union all select 'feature_still_off',not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),true)
 union all select 'campaigns_browser_write_closed',not has_table_privilege('anon','public.kinto_deals_v1_campaigns','INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated','public.kinto_deals_v1_campaigns','INSERT,UPDATE,DELETE')
 union all select 'products_browser_write_closed',not has_table_privilege('anon','public.kinto_deals_v1_products','INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated','public.kinto_deals_v1_products','INSERT,UPDATE,DELETE')
 union all select 'no_deals_order_triggers',not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname like '%deals%')
)
select name,ok from checks order by name;
