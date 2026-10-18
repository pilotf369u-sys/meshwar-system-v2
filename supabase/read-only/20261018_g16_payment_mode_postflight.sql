-- Read-only G16 postflight. Run on the KINTO test database after the G16 migration.
-- Every row should report ok=true; the final row displays current saved settings.
select 'payment_mode_column' as check_name,
       exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='kinto_payment_settings_g16'
           and column_name='payment_mode' and data_type='text'
           and column_default like '%manual%'
       ) as ok
union all
select 'gateway_environment_column',
       exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='kinto_payment_settings_g16'
           and column_name='gateway_environment' and data_type='text'
           and column_default like '%sandbox%'
       )
union all
select 'audit_table_rls_enabled',
       exists (
         select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname='kinto_payment_settings_audit_g16'
           and c.relrowsecurity
       )
union all
select 'admin_rpc_requires_verified_session',
       exists (
         select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='kinto_payment_mode_admin_g16'
           and p.prosecdef
           and position('require_admin_session_v147' in pg_get_functiondef(p.oid))>0
       );

select singleton, payment_mode, gateway_environment, gateways_enabled, updated_at
from public.kinto_payment_settings_g16
where singleton=true;
