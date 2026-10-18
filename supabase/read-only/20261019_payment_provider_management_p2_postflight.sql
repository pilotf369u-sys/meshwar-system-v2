-- Payment-P2 postflight checks. Read-only: run only after reviewing and applying
-- 20261019010000_payment_provider_management_p2.sql to the isolated KINTO test DB.

select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'kinto_payment_providers_p2',
    'kinto_payment_runtime_p2',
    'kinto_payment_provider_audit_p2'
  )
order by c.table_name, c.ordinal_position;

select cls.relname as table_name,
       cls.relrowsecurity as rls_enabled,
       has_table_privilege('anon', cls.oid, 'select,insert,update,delete') as anon_has_any_table_access,
       has_table_privilege('authenticated', cls.oid, 'select,insert,update,delete') as authenticated_has_any_table_access
from pg_class cls
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public'
  and cls.relname in (
    'kinto_payment_providers_p2',
    'kinto_payment_runtime_p2',
    'kinto_payment_provider_audit_p2'
  )
order by cls.relname;

select has_function_privilege('anon',
         'public.kinto_payment_provider_admin_p2(text,text,text,boolean,text)', 'execute') as anon_can_call_admin_rpc,
       has_function_privilege('authenticated',
         'public.kinto_payment_provider_admin_p2(text,text,text,boolean,text)', 'execute') as authenticated_can_call_admin_rpc,
       has_function_privilege('anon',
         'public.kinto_payment_p2_assert_new_payment_allowed(text)', 'execute') as anon_can_call_server_gate,
       has_function_privilege('authenticated',
         'public.kinto_payment_p2_assert_new_payment_allowed(text)', 'execute') as authenticated_can_call_server_gate,
       has_function_privilege('service_role',
         'public.kinto_payment_p2_assert_new_payment_allowed(text)', 'execute') as service_role_can_call_server_gate;

select provider_key, display_name, checkout_protocol, test_only, enabled,
       integration_ready, real_collection_allowed, adapter_version
from public.kinto_payment_providers_p2
order by provider_key;

select singleton, selected_provider_key, emergency_stop, emergency_reason,
       emergency_actor, emergency_changed_at
from public.kinto_payment_runtime_p2;

select singleton, payment_mode, gateway_environment, gateways_enabled
from public.kinto_payment_settings_g16;

select id, actor_id, action, provider_key, old_value, new_value, created_at
from public.kinto_payment_provider_audit_p2
order by id desc
limit 25;
