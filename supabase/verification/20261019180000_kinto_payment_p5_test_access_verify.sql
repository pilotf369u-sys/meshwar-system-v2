-- Read-only verification for P5 test-account authorization.
select
  to_regclass('private.kinto_payment_test_accounts_p5') as allowlist_table,
  has_table_privilege('anon','private.kinto_payment_test_accounts_p5','SELECT') as anon_can_read,
  has_table_privilege('authenticated','private.kinto_payment_test_accounts_p5','INSERT') as authenticated_can_insert,
  has_function_privilege('anon','public.kinto_payment_p5_test_access_check_v1(text)','EXECUTE') as anon_can_check,
  has_function_privilege('service_role','public.kinto_payment_p5_test_access_check_v1(text)','EXECUTE') as service_role_can_check,
  has_function_privilege('authenticated','public.kinto_payment_p5_test_access_admin_v1(text,text,boolean,integer)','EXECUTE') as authenticated_can_call_admin_gate,
  has_function_privilege('anon','public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)','EXECUTE') as anon_can_simulate,
  has_function_privilege('service_role','public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)','EXECUTE') as service_role_can_simulate;

select customer_id,granted_by,granted_at,expires_at,revoked_at,
       (revoked_at is null and expires_at>clock_timestamp()) as currently_allowed
from private.kinto_payment_test_accounts_p5
order by granted_at desc;

select p.oid::regprocedure as function_name,p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) like '%PAYMENT_P5_TEST_ACCESS_REQUIRED%' as simulation_checks_allowlist,
       pg_get_functiondef('public.kinto_payment_p5_test_access_admin_v1(text,text,boolean,integer)'::regprocedure)
         like '%P5T-%' as grants_require_test_customer_id
from pg_proc p
where p.oid='public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb)'::regprocedure;
