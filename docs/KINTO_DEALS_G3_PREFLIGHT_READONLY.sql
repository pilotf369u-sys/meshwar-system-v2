-- KINTO DEALS G3: READ ONLY preflight. Run in Supabase SQL Editor; no changes.
-- Verify existing G1 schema and session verifier signatures before proposing G3 SQL.
select 'g1_columns' as section,table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in
('kinto_deals_v1_flags','kinto_deals_v1_campaigns','kinto_deals_v1_products','kinto_deals_v1_submissions','kinto_deals_v1_redemptions')
order by table_name,ordinal_position;

select 'session_functions' as section,n.nspname as schema_name,p.proname as function_name,
 pg_get_function_identity_arguments(p.oid) as args,
 pg_get_function_result(p.oid) as returns,
 p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('private','public') and p.proname in
('require_admin_session_v147','require_vendor_session','admin_send_customer_notice_v420')
order by n.nspname,p.proname;

select 'g1_permissions' as section,c.relname,c.relrowsecurity,
 coalesce((select count(*) from pg_policies pol where pol.schemaname='public' and pol.tablename=c.relname),0) as policies,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_any_access,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated_any_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'kinto_deals_v1_%'
order by c.relname;

select 'flag' as section,key,enabled from public.kinto_deals_v1_flags;

-- Find the admin and vendor notification objects, without reading customer/vendor data.
select 'notification_schema' as section,table_name,column_name,data_type,udt_name
from information_schema.columns
where table_schema='public' and (
 table_name in ('admin_vendor_notifications_v391','kinto_admin_notifications','kinto_admin_notification_recipients')
 or table_name like '%vendor%notification%' or table_name like '%admin%notification%')
order by table_name,ordinal_position;

select 'g1_constraints' as section,c.conrelid::regclass::text as table_name,c.conname,
 pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.kinto_deals_v1_campaigns'::regclass,
'public.kinto_deals_v1_submissions'::regclass,'public.kinto_deals_v1_products'::regclass)
order by table_name,c.conname;
