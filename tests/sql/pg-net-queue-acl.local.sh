#!/usr/bin/env bash
# Use only on a fresh local Docker PostgreSQL with pg_net preloaded and a loopback HTTP fixture.
set -euo pipefail
: "${KINTO_ACL_TEST_CONTAINER:?Disposable local container required}"
: "${KINTO_ACL_TEST_HTTP_URL:?Loopback HTTP fixture required}"
[[ "$KINTO_ACL_TEST_HTTP_URL" =~ ^http://127\.0\.0\.1:[0-9]+/[^[:space:]]*$ ]]
[[ "${KINTO_ACL_TEST_ALLOW_WRITES:-}" == YES_DISPOSABLE_ONLY ]]

cd "$(dirname "$0")/../.."
db=(docker exec -i "$KINTO_ACL_TEST_CONTAINER" psql -Xq -U postgres -p "${KINTO_ACL_TEST_PG_PORT:-5432}" -d postgres -v ON_ERROR_STOP=1)
migration=supabase/migrations/20261119100000_kinto_pg_net_queue_acl.sql
rollback=supabase/rollback/20261119100000_kinto_pg_net_queue_acl_rollback.sql
"${db[@]}" <<'SQL'
create extension if not exists pg_net;
create schema if not exists private;
create schema if not exists cron;
create table if not exists cron.job(jobid bigint, jobname text, database text, username text, schedule text, active boolean, command text);
create role kinto_acl_test_sender;
insert into cron.job(jobid,jobname,database,username,schedule,active,command)
values (154, 'kinto-g13-hourly-ad-cleanup',current_database(),'kinto_acl_test_sender','0 * * * *',true,'synthetic fixture');
grant usage on schema net to public;
grant usage on all sequences in schema net to public;
grant all privileges on net.http_request_queue to public;
grant select(headers), update(url) on net.http_request_queue to authenticated;
begin;
insert into net.http_request_queue(method,url,headers,timeout_milliseconds)
values ('GET','http://127.0.0.1:1/','{"x-synthetic":"canary"}',1000);
set local role anon;
do $$begin
  assert exists (select 1 from net.http_request_queue where headers->>'x-synthetic'='canary');
end$$;
rollback;
SQL

if "${db[@]}" < "$migration" >/tmp/kinto-pg-net-acl-rejected.log 2>&1; then
  echo 'Unreviewed migration unexpectedly succeeded' >&2
  exit 1
fi
rg -q 'KINTO_PG_NET_ACL_UNVERIFIED_DEPLOYMENT' /tmp/kinto-pg-net-acl-rejected.log

{
  cat <<'SQL'
select set_config('kinto.pg_net_queue_acl_manifest', jsonb_build_object(
  'version',(select extversion from pg_extension where extname='pg_net'),
  'worker',(select distinct usename from pg_stat_activity where datname=current_database() and backend_type like 'pg_net%worker'),
  'g13_owner','kinto_acl_test_sender','g13_sender','kinto_acl_test_sender',
  'senders',jsonb_build_array('kinto_acl_test_sender'),'inventory_reviewed',true)::text,false) as manifest
\gset
SQL
  cat "$migration"
} | "${db[@]}"
"${db[@]}" <<'SQL'
do $$
declare client text;
begin
  foreach client in array array['anon','authenticated'] loop
    assert not has_any_column_privilege(client,'net.http_request_queue','SELECT,INSERT,UPDATE');
    assert not has_table_privilege(client,'net.http_request_queue','DELETE,TRUNCATE');
  end loop;
  assert has_column_privilege('kinto_acl_test_sender','net.http_request_queue','id','SELECT');
  assert not has_column_privilege('kinto_acl_test_sender','net.http_request_queue','headers','SELECT');
end;
$$;
set role authenticated;
do $$
begin
  begin
    perform headers from net.http_request_queue where false;
    raise exception 'Unexpected client read';
  exception when insufficient_privilege then null;
  end;
  begin
    update net.http_request_queue set url = 'http://127.0.0.1:1/' where false;
    raise exception 'Unexpected client update';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from net.http_request_queue where false;
    raise exception 'Unexpected client delete';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
SQL
request_id=$("${db[@]}" -At -v endpoint="$KINTO_ACL_TEST_HTTP_URL" <<'SQL'
begin;
set local role kinto_acl_test_sender;
select net.http_post(url := :'endpoint', body := '{"test":"synthetic"}'::jsonb,
  headers := '{"x-synthetic":"kinto"}'::jsonb);
commit;
SQL
)
[[ "$request_id" =~ ^[0-9]+$ ]]
status=
for _ in {1..30}; do
  status=$("${db[@]}" -Atc "select status_code from net._http_response where id = $request_id")
  [[ -n "$status" ]] && break
  sleep 1
done
[[ "$status" == 200 ]]
[[ "$("${db[@]}" -Atc "select count(*) from net.http_request_queue where id = $request_id")" == 0 ]]

if "${db[@]}" < "$rollback" >/tmp/kinto-pg-net-acl-restore-rejected.log 2>&1; then
  echo 'Unreviewed rollback unexpectedly succeeded' >&2
  exit 1
fi
rg -q 'KINTO_PG_NET_ACL_RESTORE_NOT_APPROVED_BY_SNAPSHOT' /tmp/kinto-pg-net-acl-restore-rejected.log
{
  printf "%s\n" "set kinto.pg_net_queue_acl_restore = '{\"role\":\"kinto_acl_test_sender\",\"privilege\":\"SELECT\"}';"
  cat "$rollback"
} | "${db[@]}"
"${db[@]}" <<'SQL'
do $$begin
  assert has_table_privilege('kinto_acl_test_sender','net.http_request_queue','SELECT');
  assert not has_column_privilege('anon','net.http_request_queue','headers','SELECT');
  assert not has_table_privilege('authenticated','net.http_request_queue','DELETE');
end$$;
SQL
echo 'PASS native enqueue, loopback HTTP 200, queue consumption and targeted recovery'
