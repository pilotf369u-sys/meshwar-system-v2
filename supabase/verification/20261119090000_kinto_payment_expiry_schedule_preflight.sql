-- Read-only. Use the exact role proposed for installation and cron ownership.
begin read only;
set local statement_timeout = '10s';

select current_database() as target_database, current_user as proposed_cron_owner,
       current_setting('cron.database_name', true) as cron_database,
       current_setting('cron.log_run', true) as cron_run_logging;

select extname, extversion from pg_extension
where extname in ('pg_cron', 'pg_net', 'supabase_vault')
order by extname;

with api(schema_name, signature) as (
  values ('cron', 'cron.schedule(text,text,text)'),
         ('cron', 'cron.unschedule(bigint)'),
         ('net', 'net.http_post(text,jsonb,jsonb,jsonb,integer)')
)
select signature, to_regprocedure(signature) is not null as present,
       has_schema_privilege(current_user, to_regnamespace(schema_name), 'USAGE') as schema_usage,
       has_function_privilege(current_user, to_regprocedure(signature), 'EXECUTE') as can_execute
from api;

with objects(schema_name, relation_name, column_name) as (
  values ('vault', 'vault.decrypted_secrets', 'decrypted_secret'),
         ('net', 'net.http_request_queue', 'headers'),
         ('net', 'net._http_response', 'status_code'),
         ('cron', 'cron.job', 'jobname'),
         ('cron', 'cron.job_run_details', 'status')
)
select relation_name, column_name, to_regclass(relation_name) is not null as present,
       has_schema_privilege(current_user, to_regnamespace(schema_name), 'USAGE') as owner_schema_usage,
       has_column_privilege(current_user, to_regclass(relation_name), column_name, 'SELECT') as owner_read,
       has_column_privilege('anon', to_regclass(relation_name), column_name, 'SELECT') as anon_read,
       has_column_privilege('authenticated', to_regclass(relation_name), column_name, 'SELECT') as authenticated_read
from objects;

with rpc as (
  select to_regprocedure('public.kinto_payment_attempt_expire_p4(integer)') as oid
)
select oid is not null as p4_rpc_present,
       has_function_privilege('service_role', oid, 'EXECUTE') as service_role_execute,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute
from rpc;

-- Returns name counts only. Does not read or output decrypted_secret.
-- Run after confirming the Vault view exists and this role can read its name column.
select name, count(*) as entries
from vault.decrypted_secrets
where name in ('kinto_payment_expiry_origin', 'kinto_payment_expiry_secret')
group by name order by name;

-- Run after confirming cron.job access. Compare the result with an authorized
-- cron administrator's inventory because pg_cron can limit visibility by owner.
select jobid, jobname, database, username, schedule, active
from cron.job where jobname = 'kinto-payment-expiry-p4';

rollback;
