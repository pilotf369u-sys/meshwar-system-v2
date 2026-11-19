begin read only;
set local statement_timeout = '10s';

select extversion from pg_extension where extname = 'pg_net';
select current_database() as database, current_setting('pg_net.database_name', true) as worker_database,
       current_setting('pg_net.username', true) as worker_role;
select datname, usename, backend_type
from pg_stat_activity where backend_type like 'pg_net%worker';
-- Never output cron.command since existing commands may contain secrets.
select jobid, jobname, database, username, schedule, active,
       command ~* '\mnet\.(http_get|http_post|http_delete)\M' as direct_net_call
from cron.job
order by jobid;

select p.oid::regprocedure as function, pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'net' and p.proname in ('http_get', 'http_post', 'http_delete');
select c.relacl, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner,
       pg_get_serial_sequence('net.http_request_queue', 'id') as queue_sequence
from pg_class c where c.oid = to_regclass('net.http_request_queue');
select attname, attacl from pg_attribute
where attrelid = to_regclass('net.http_request_queue') and attnum > 0 and not attisdropped;

select role_name, has_schema_privilege(role_name, 'net', 'USAGE') as schema_usage,
       has_any_column_privilege(role_name, 'net.http_request_queue', 'SELECT') as can_read_queue,
       has_column_privilege(role_name, 'net.http_request_queue', 'headers', 'SELECT') as read_headers,
       has_any_column_privilege(role_name, 'net.http_request_queue', 'UPDATE') as can_update_queue,
       has_column_privilege(role_name, 'net.http_request_queue', 'url', 'UPDATE') as update_destination,
       has_table_privilege(role_name, 'net.http_request_queue', 'DELETE') as delete_requests
from (values ('anon'), ('authenticated')) as clients(role_name);
rollback;
