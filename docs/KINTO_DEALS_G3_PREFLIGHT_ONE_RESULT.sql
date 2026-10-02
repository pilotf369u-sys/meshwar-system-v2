-- G3 consolidated READ-ONLY preflight: ONE result table, ONE copy/paste.
with findings as (
 select '01_session_functions'::text section,
 n.nspname||'.'||p.proname as item,
 jsonb_build_object('args',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'security_definer',p.prosecdef) as detail
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('require_admin_session_v147','require_vendor_session','admin_send_customer_notice_v420')
 union all
 select '02_g1_permissions',c.relname,
 jsonb_build_object('rls',c.relrowsecurity,'policies',(select count(*) from pg_policies pol where pol.schemaname='public' and pol.tablename=c.relname),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),
 'anon_update',has_table_privilege('anon',c.oid,'UPDATE'),'anon_delete',has_table_privilege('anon',c.oid,'DELETE'),
 'auth_select',has_table_privilege('authenticated',c.oid,'SELECT'),'auth_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
 'auth_update',has_table_privilege('authenticated',c.oid,'UPDATE'),'auth_delete',has_table_privilege('authenticated',c.oid,'DELETE'))
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname like 'kinto_deals_v1_%'
 union all
 select '03_feature_flag',key,jsonb_build_object('enabled',enabled) from public.kinto_deals_v1_flags
 union all
 select '04_submission_columns',column_name,
 jsonb_build_object('type',data_type,'nullable',is_nullable,'default',column_default)
 from information_schema.columns where table_schema='public' and table_name='kinto_deals_v1_submissions'
 union all
 select '05_notification_columns',table_name||'.'||column_name,
 jsonb_build_object('type',data_type,'udt',udt_name)
 from information_schema.columns where table_schema='public' and (
 table_name in ('kinto_admin_notifications','kinto_admin_notification_recipients')
 or table_name like '%vendor%notification%' or table_name like '%admin%notification%')
)
select section,item,detail from findings order by section,item;
