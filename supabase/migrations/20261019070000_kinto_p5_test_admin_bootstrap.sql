-- P5 test-project one-time bootstrap. The capability is closed by default.
-- Production deployments of this migration remain disabled unless an owner
-- explicitly opens the gate on the isolated test project.
begin;

create schema if not exists private;

create table if not exists private.kinto_payment_p5_test_admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  admin_id text,
  admin_identity text,
  created_at timestamptz,
  closed_at timestamptz,
  constraint kinto_payment_p5_test_admin_bootstrap_state_ck check (
    (admin_id is null and admin_identity is null and created_at is null)
    or (admin_id is not null and admin_identity like 'P5ADM-%' and created_at is not null)
  )
);

insert into private.kinto_payment_p5_test_admin_bootstrap(singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table private.kinto_payment_p5_test_admin_bootstrap enable row level security;
revoke all on table private.kinto_payment_p5_test_admin_bootstrap from public, anon, authenticated;

create or replace function public.kinto_payment_p5_test_admin_bootstrap_v1(
  p_admin_identity text,
  p_password_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_gate private.kinto_payment_p5_test_admin_bootstrap%rowtype;
  v_role text;
  v_id text;
  v_identity text := upper(trim(coalesce(p_admin_identity, '')));
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_role <> 'service_role' then
    raise exception 'P5_TEST_BOOTSTRAP_SERVICE_ONLY' using errcode = '42501';
  end if;
  if v_identity !~ '^P5ADM-[0-9A-F]{8}-[0-9A-F]{4}-[1-8][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$'
     or coalesce(p_password_hash, '') !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' then
    return jsonb_build_object('ok', false, 'error', 'TEST_ADMIN_FIELDS_INVALID');
  end if;

  select * into v_gate
    from private.kinto_payment_p5_test_admin_bootstrap
   where singleton = true
   for update;
  if not found or not v_gate.enabled or v_gate.admin_id is not null or v_gate.closed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'TEST_ADMIN_BOOTSTRAP_CLOSED');
  end if;

  insert into public.employees(name, phone, password, role, permissions)
  values (
    'KINTO Payment-P5 Test Administrator',
    v_identity,
    p_password_hash,
    'admin',
    '{"scope":"KINTO-Payment-Test","purpose":"Payment-P5 test only"}'::jsonb
  )
  returning id::text into v_id;

  update private.kinto_payment_p5_test_admin_bootstrap
     set enabled = false, admin_id = v_id, admin_identity = v_identity, created_at = clock_timestamp()
   where singleton = true;

  return jsonb_build_object('ok', true, 'admin_id', v_id, 'admin_identity', v_identity);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'TEST_ADMIN_ID_COLLISION');
end;
$$;

revoke all on function public.kinto_payment_p5_test_admin_bootstrap_v1(text, text) from public, anon, authenticated;
grant execute on function public.kinto_payment_p5_test_admin_bootstrap_v1(text, text) to service_role;

commit;
