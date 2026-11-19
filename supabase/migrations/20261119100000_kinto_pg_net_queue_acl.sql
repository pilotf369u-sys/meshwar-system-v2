-- Supply the reviewed deployment manifest on this connection before running.
begin;
lock table net.http_request_queue in access exclusive mode nowait;

create table private.kinto_pg_net_queue_acl_backup (
  singleton boolean primary key check (singleton),
  captured_at timestamptz not null default clock_timestamp(),
  extension_version text not null,
  table_acl aclitem[],
  column_acls jsonb not null,
  server_permissions jsonb not null
);
alter table private.kinto_pg_net_queue_acl_backup enable row level security;
revoke all on private.kinto_pg_net_queue_acl_backup from public, anon, authenticated;

do $acl$
declare
  config jsonb := nullif(current_setting('kinto.pg_net_queue_acl_manifest', true), '')::jsonb;
  queue regclass := 'net.http_request_queue'::regclass;
  version text;
  g13_owner text;
  worker text;
  configured_worker text := nullif(current_setting('pg_net.username', true), '');
  columns text;
  role_name text;
  snapshots jsonb := '{}'::jsonb;
begin
  select distinct usename into strict worker
    from pg_stat_activity
    where datname = current_database() and backend_type like 'pg_net%worker';
  select extversion into version from pg_extension where extname = 'pg_net';
  select username into strict g13_owner from cron.job where jobname = 'kinto-g13-hourly-ad-cleanup';
  if config is null or version is null or config->>'version' is distinct from version
     or config->>'g13_owner' is distinct from g13_owner
     or worker is null or config->>'worker' is distinct from worker
     or (configured_worker is not null and configured_worker <> worker)
     or jsonb_typeof(config->'senders') is distinct from 'array'
     or nullif(config->>'g13_sender', '') is null
     or not (config->'senders' ? (config->>'g13_sender'))
     or (config->>'inventory_reviewed') is distinct from 'true' then
    raise exception 'KINTO_PG_NET_ACL_UNVERIFIED_DEPLOYMENT';
  end if;

  for role_name in
    select value from jsonb_array_elements_text(config->'senders')
    union select worker
    union select value from jsonb_array_elements_text(coalesce(config->'readers', '[]'))
  loop
    if role_name is null or role_name in ('anon', 'authenticated', 'public')
       or to_regrole(role_name) is null
       or pg_has_role('anon', role_name, 'MEMBER')
       or pg_has_role('authenticated', role_name, 'MEMBER')
       or not has_schema_privilege(role_name, 'net', 'USAGE') then
      raise exception 'KINTO_PG_NET_ACL_UNSAFE_SERVER_ROLE: %', role_name;
    end if;
    snapshots := snapshots || jsonb_build_object(role_name, jsonb_build_object(
      'SELECT', has_table_privilege(role_name, queue, 'SELECT'),
      'INSERT', has_table_privilege(role_name, queue, 'INSERT'),
      'UPDATE', has_table_privilege(role_name, queue, 'UPDATE'),
      'DELETE', has_table_privilege(role_name, queue, 'DELETE')
    ));
  end loop;

  select string_agg(quote_ident(attname), ', ' order by attnum) into columns
  from pg_attribute where attrelid = queue and attnum > 0 and not attisdropped;

  insert into private.kinto_pg_net_queue_acl_backup
      (singleton, extension_version, table_acl, column_acls, server_permissions)
  select true, version, relacl, (
    select jsonb_object_agg(attname, attacl::text) from pg_attribute
    where attrelid = queue and attnum > 0 and not attisdropped
  ), snapshots
  from pg_class where oid = queue;

  for role_name in select distinct value from jsonb_array_elements_text(config->'senders')
  loop
    if not has_table_privilege(role_name, queue, 'INSERT')
       or not has_column_privilege(role_name, queue, 'id', 'SELECT')
       or not (has_sequence_privilege(role_name, pg_get_serial_sequence('net.http_request_queue', 'id'), 'USAGE')
               or has_sequence_privilege(role_name, pg_get_serial_sequence('net.http_request_queue', 'id'), 'UPDATE')) then
      raise exception 'KINTO_PG_NET_ACL_SENDER_PREREQUISITE: %', role_name;
    end if;
    execute format('grant insert, select (id) on net.http_request_queue to %I', role_name);
  end loop;

  for role_name in select distinct value from jsonb_array_elements_text(coalesce(config->'readers', '[]'))
  loop
    if not has_table_privilege(role_name, queue, 'SELECT') then
      raise exception 'KINTO_PG_NET_ACL_READER_PREREQUISITE: %', role_name;
    end if;
    execute format('grant select on net.http_request_queue to %I', role_name);
  end loop;

  if not has_table_privilege(worker, queue, 'SELECT') or not has_table_privilege(worker, queue, 'DELETE') then
    raise exception 'KINTO_PG_NET_ACL_WORKER_PREREQUISITE: %', worker;
  end if;
  execute format('grant select, delete on net.http_request_queue to %I', worker);

  revoke all privileges on table net.http_request_queue from public, anon, authenticated;
  execute format('revoke all privileges (%s) on table net.http_request_queue from public, anon, authenticated', columns);

  foreach role_name in array array['anon', 'authenticated']
  loop
    if has_any_column_privilege(role_name, queue, 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_table_privilege(role_name, queue, 'DELETE,TRUNCATE,TRIGGER') then
      raise exception 'KINTO_PG_NET_ACL_RESIDUAL_CLIENT_PRIVILEGES: %', role_name;
    end if;
  end loop;
end;
$acl$;
commit;
