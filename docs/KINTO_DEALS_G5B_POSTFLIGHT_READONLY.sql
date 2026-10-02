-- G5B read-only postflight: all six rows must be TRUE. No customer data exposed.
select 'quote_security_definer' name,coalesce((select p.prosecdef from pg_proc p where p.oid=to_regprocedure('public.kinto_deals_v1_customer_quote_g5(text,uuid,jsonb)')),false) ok
union all select 'quote_execute',coalesce(has_function_privilege('authenticated','public.kinto_deals_v1_customer_quote_g5(text,uuid,jsonb)','EXECUTE'),false)
union all select 'feature_still_off',coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false)
union all select 'redemptions_browser_write_closed',not has_table_privilege('authenticated','public.kinto_deals_v1_redemptions','INSERT,UPDATE,DELETE')
union all select 'campaign_browser_read_closed',not has_table_privilege('authenticated','public.kinto_deals_v1_campaigns','SELECT')
union all select 'no_deals_order_triggers',not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('orders','local_products') and not t.tgisinternal and t.tgname ilike '%deals%');
