-- Targeted recovery only. Set kinto.pg_net_queue_acl_restore to a reviewed
-- JSON object with role and privilege. Broad PUBLIC access stays revoked.
begin;
lock table net.http_request_queue in access exclusive mode nowait;
do $restore$
declare
  request jsonb := nullif(current_setting('kinto.pg_net_queue_acl_restore', true), '')::jsonb;
  target text := request->>'role';
  privilege text := request->>'privilege';
  snapshot jsonb;
begin
  select server_permissions into strict snapshot from private.kinto_pg_net_queue_acl_backup;
  if target is null or target in ('public', 'anon', 'authenticated')
     or to_regrole(target) is null or pg_has_role('anon', target, 'MEMBER')
     or pg_has_role('authenticated', target, 'MEMBER')
     or privilege is null or privilege not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     or (snapshot->target->>privilege) is distinct from 'true' then
    raise exception 'KINTO_PG_NET_ACL_RESTORE_NOT_APPROVED_BY_SNAPSHOT';
  end if;
  execute format('grant %s on net.http_request_queue to %I', privilege, target);
  if exists (
    select 1 from (values ('anon'), ('authenticated')) as clients(role_name)
    where has_any_column_privilege(role_name, 'net.http_request_queue', 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_table_privilege(role_name, 'net.http_request_queue', 'DELETE,TRUNCATE,TRIGGER')
  ) then
    raise exception 'KINTO_PG_NET_ACL_RESTORE_EXPOSES_CLIENTS';
  end if;
end;
$restore$;
commit;
