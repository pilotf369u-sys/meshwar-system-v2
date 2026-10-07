-- G4J read-only postflight: expect all rows TRUE.
select 'revision_definer' as name,coalesce((select p.prosecdef from pg_proc p where p.oid=to_regprocedure('public.kinto_deals_v1_vendor_revise_rejected_g4(text,uuid)')),false) as ok
union all select 'revision_execute_granted',coalesce(has_function_privilege('authenticated','public.kinto_deals_v1_vendor_revise_rejected_g4(text,uuid)','EXECUTE'),false)
union all select 'feature_still_off',coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false)
union all select 'campaign_browser_write_closed',not has_table_privilege('authenticated','public.kinto_deals_v1_campaigns','INSERT,UPDATE,DELETE')
union all select 'submissions_browser_write_closed',not has_table_privilege('authenticated','public.kinto_deals_v1_submissions','INSERT,UPDATE,DELETE')
union all select 'no_deals_order_triggers',not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('orders','order_items','local_products') and not t.tgisinternal and t.tgname ilike '%deals%');
