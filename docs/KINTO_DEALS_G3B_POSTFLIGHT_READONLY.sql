-- G3B postflight: ONE read-only result. Run after approved migration only.
with checks as (
 select 'feature_flag_off' name,
  not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),true) ok
 union all select 'vendor_feed_security_definer',
  coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_vendor_review_feed_g3(text,integer)'::regprocedure),false)
 union all select 'vendor_feed_browser_execute',
  has_function_privilege('anon','public.kinto_deals_v1_vendor_review_feed_g3(text,integer)','EXECUTE')
  and has_function_privilege('authenticated','public.kinto_deals_v1_vendor_review_feed_g3(text,integer)','EXECUTE')
 union all select 'submissions_no_browser_read',
  not has_table_privilege('anon','public.kinto_deals_v1_submissions','SELECT')
  and not has_table_privilege('authenticated','public.kinto_deals_v1_submissions','SELECT')
 union all select 'review_events_no_browser_read',
  not has_table_privilege('anon','public.kinto_deals_v1_review_events','SELECT')
  and not has_table_privilege('authenticated','public.kinto_deals_v1_review_events','SELECT')
 union all select 'no_deals_order_triggers',
  not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname like '%deals%')
)
select name,ok from checks order by name;
