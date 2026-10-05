-- G3A postflight READ ONLY: run only AFTER reviewed G3A migration is approved and applied.
with checks as (
 select 'flag_still_off' name,
   not coalesce((select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),true) ok
 union all select 'review_events_rls',coalesce((select relrowsecurity from pg_class where oid='public.kinto_deals_v1_review_events'::regclass),false)
 union all select 'review_events_no_policies',not exists(select 1 from pg_policies where schemaname='public' and tablename='kinto_deals_v1_review_events')
 union all select 'review_events_no_browser_table_grants',not (
 has_table_privilege('anon','public.kinto_deals_v1_review_events','SELECT') or
 has_table_privilege('anon','public.kinto_deals_v1_review_events','INSERT') or
 has_table_privilege('authenticated','public.kinto_deals_v1_review_events','SELECT') or
 has_table_privilege('authenticated','public.kinto_deals_v1_review_events','INSERT'))
 union all select 'admin_inbox_definer',coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_admin_inbox_g3(text)'::regprocedure),false)
 union all select 'admin_decision_definer',coalesce((select prosecdef from pg_proc where oid='public.kinto_deals_v1_admin_decide_g3(text,uuid,integer,text,text)'::regprocedure),false)
 union all select 'no_order_triggers_added',not exists(
 select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname like '%deals%')
)
select name,ok from checks order by name;
