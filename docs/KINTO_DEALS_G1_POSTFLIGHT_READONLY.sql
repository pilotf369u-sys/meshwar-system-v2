-- G1 POSTFLIGHT, READ-ONLY. Execute only AFTER owner-approved G1 migration.
-- Expected: 5 tables, all RLS true; flag false; zero browser privileges/policies.
select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename like 'kinto_deals_v1_%'
order by tablename;

select key,enabled from public.kinto_deals_v1_flags
where key='merchant_deals_enabled';

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name like 'kinto_deals_v1_%'
  and grantee in ('PUBLIC','anon','authenticated')
order by table_name,grantee,privilege_type;

select schemaname,tablename,policyname,roles,cmd
from pg_policies
where schemaname='public' and tablename like 'kinto_deals_v1_%'
order by tablename,policyname;

-- All new triggers MUST be attached exclusively to DEALS tables.
select event_object_table,trigger_name,event_manipulation
from information_schema.triggers
where trigger_schema='public' and trigger_name like 'trg_kinto_deals_v1_%'
order by event_object_table,trigger_name,event_manipulation;

-- Baseline must remain present, without modifications by this migration.
select to_regprocedure('public.checkout_independent_vendor_orders_v101(uuid,text,text,jsonb,jsonb)') as checkout_signature_if_present,
       to_regclass('public.kinto_campaigns') as existing_admin_campaigns,
       to_regclass('public.orders') as existing_orders;
