-- Payment-P2: provider administration and server-enforced fail-closed controls.
-- This migration adds no checkout, payment-intent, order, inventory or invoice flow.
-- Real collection remains impossible until a separately reviewed integration migration.
begin;

create table if not exists public.kinto_payment_providers_p2 (
  provider_key text primary key check (provider_key ~ '^[a-z][a-z0-9_-]{1,47}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  checkout_protocol text not null check (checkout_protocol in ('simulator','hosted_checkout','api','sdk')),
  test_only boolean not null default true,
  enabled boolean not null default false,
  integration_ready boolean not null default false check (integration_ready is false),
  real_collection_allowed boolean not null default false check (real_collection_allowed is false),
  adapter_version text not null default 'unbound' check (char_length(adapter_version) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((checkout_protocol = 'simulator') = test_only)
);

insert into public.kinto_payment_providers_p2
  (provider_key, display_name, checkout_protocol, test_only, enabled, adapter_version)
values
  ('kinto-simulator', 'محاكي KINTO (اختبار بلا تحصيل)', 'simulator', true, false, 'catalog-only-p2')
on conflict (provider_key) do nothing;

create table if not exists public.kinto_payment_runtime_p2 (
  singleton boolean primary key default true check (singleton),
  selected_provider_key text references public.kinto_payment_providers_p2(provider_key),
  emergency_stop boolean not null default true,
  emergency_reason text,
  emergency_actor text,
  emergency_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (emergency_reason is null or char_length(emergency_reason) <= 500)
);

insert into public.kinto_payment_runtime_p2(singleton, emergency_stop)
values (true, true)
on conflict (singleton) do nothing;

create table if not exists public.kinto_payment_provider_audit_p2 (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null check (action in (
    'provider_enabled','provider_disabled','provider_selected',
    'emergency_stop','emergency_resume_blocked'
  )),
  provider_key text,
  old_value jsonb not null default '{}'::jsonb check (jsonb_typeof(old_value) = 'object'),
  new_value jsonb not null default '{}'::jsonb check (jsonb_typeof(new_value) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.kinto_payment_providers_p2 enable row level security;
alter table public.kinto_payment_runtime_p2 enable row level security;
alter table public.kinto_payment_provider_audit_p2 enable row level security;
revoke all on public.kinto_payment_providers_p2 from public, anon, authenticated;
revoke all on public.kinto_payment_runtime_p2 from public, anon, authenticated;
revoke all on public.kinto_payment_provider_audit_p2 from public, anon, authenticated;

create or replace function public.kinto_payment_provider_admin_p2(
  p_session_token text,
  p_action text default 'get',
  p_provider_key text default null,
  p_enabled boolean default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $p2_admin$
declare
  v_admin text;
  v_runtime public.kinto_payment_runtime_p2%rowtype;
  v_provider public.kinto_payment_providers_p2%rowtype;
  v_payment public.kinto_payment_settings_g16%rowtype;
  v_selected_provider_found boolean := false;
  v_old jsonb;
  v_new jsonb;
  v_providers jsonb;
begin
  v_admin := private.require_admin_session_v147(p_session_token);
  if nullif(btrim(v_admin), '') is null then
    raise exception 'ADMIN_SESSION_REQUIRED' using errcode = '28000';
  end if;

  select * into v_runtime
  from public.kinto_payment_runtime_p2
  where singleton = true
  for update;
  if not found then
    insert into public.kinto_payment_runtime_p2(singleton, emergency_stop)
    values (true, true)
    returning * into v_runtime;
  end if;

  if p_action = 'set_provider_enabled' then
    if p_provider_key is null or p_enabled is null then
      raise exception 'PROVIDER_STATE_REQUIRED' using errcode = '22023';
    end if;
    select * into v_provider
    from public.kinto_payment_providers_p2
    where provider_key = p_provider_key
    for update;
    if not found then raise exception 'PROVIDER_NOT_FOUND' using errcode = 'P0002'; end if;

    v_old := jsonb_build_object('enabled', v_provider.enabled);
    update public.kinto_payment_providers_p2
       set enabled = p_enabled, updated_at = now()
     where provider_key = p_provider_key
     returning * into v_provider;
    if not p_enabled and v_runtime.selected_provider_key = p_provider_key then
      update public.kinto_payment_runtime_p2
         set selected_provider_key = null, updated_at = now()
       where singleton = true
       returning * into v_runtime;
    end if;
    v_new := jsonb_build_object('enabled', v_provider.enabled);
    insert into public.kinto_payment_provider_audit_p2(actor_id, action, provider_key, old_value, new_value)
    values (v_admin, case when p_enabled then 'provider_enabled' else 'provider_disabled' end,
            p_provider_key, v_old, v_new);

  elsif p_action = 'select_provider' then
    if p_provider_key is null then raise exception 'PROVIDER_REQUIRED' using errcode = '22023'; end if;
    select * into v_provider
    from public.kinto_payment_providers_p2
    where provider_key = p_provider_key and enabled = true
    for share;
    if not found then raise exception 'PROVIDER_NOT_ENABLED' using errcode = '55000'; end if;
    v_old := jsonb_build_object('selected_provider_key', v_runtime.selected_provider_key);
    update public.kinto_payment_runtime_p2
       set selected_provider_key = p_provider_key, updated_at = now()
     where singleton = true
     returning * into v_runtime;
    v_new := jsonb_build_object('selected_provider_key', v_runtime.selected_provider_key);
    insert into public.kinto_payment_provider_audit_p2(actor_id, action, provider_key, old_value, new_value)
    values (v_admin, 'provider_selected', p_provider_key, v_old, v_new);

  elsif p_action = 'emergency_stop' then
    if char_length(btrim(coalesce(p_reason, ''))) < 8 then
      raise exception 'PAUSE_REASON_REQUIRED' using errcode = '22023';
    end if;
    v_old := jsonb_build_object('emergency_stop', v_runtime.emergency_stop,
                                'reason', v_runtime.emergency_reason);
    update public.kinto_payment_runtime_p2
       set emergency_stop = true,
           emergency_reason = left(btrim(p_reason), 500),
           emergency_actor = v_admin,
           emergency_changed_at = now(),
           updated_at = now()
     where singleton = true
     returning * into v_runtime;
    v_new := jsonb_build_object('emergency_stop', true, 'reason', v_runtime.emergency_reason);
    insert into public.kinto_payment_provider_audit_p2(actor_id, action, old_value, new_value)
    values (v_admin, 'emergency_stop', v_old, v_new);

  elsif p_action = 'resume_new_payments' then
    select * into v_payment
    from public.kinto_payment_settings_g16
    where singleton = true
    for share;
    select * into v_provider
    from public.kinto_payment_providers_p2
    where provider_key = v_runtime.selected_provider_key
    for share;
    v_selected_provider_found := found;

    -- A resume request can be recorded, but this phase is hard-locked to manual.
    -- Integration flags are constrained false and the simulator is test-only.
    if v_runtime.selected_provider_key is null
       or not v_selected_provider_found
       or v_provider.enabled is not true
       or v_provider.test_only is true
       or v_provider.integration_ready is not true
       or v_provider.real_collection_allowed is not true
       or v_payment.payment_mode is distinct from 'electronic'
       or v_payment.gateways_enabled is not true then
      insert into public.kinto_payment_provider_audit_p2(actor_id, action, provider_key, old_value, new_value)
      values (v_admin, 'emergency_resume_blocked', v_runtime.selected_provider_key,
              jsonb_build_object('emergency_stop', v_runtime.emergency_stop),
              jsonb_build_object('result', 'blocked', 'reason', 'PAYMENT_P2_COLLECTION_NOT_IMPLEMENTED'));
      return jsonb_build_object('ok', false, 'error', 'PAYMENT_P2_COLLECTION_NOT_IMPLEMENTED',
                                'emergency_stop', v_runtime.emergency_stop,
                                'effective_payment_mode', 'manual',
                                'real_collection_allowed', false);
    end if;
    raise exception 'PAYMENT_P2_COLLECTION_NOT_IMPLEMENTED' using errcode = '55000';

  elsif p_action <> 'get' then
    raise exception 'INVALID_ACTION' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_key', p.provider_key,
    'display_name', p.display_name,
    'checkout_protocol', p.checkout_protocol,
    'test_only', p.test_only,
    'enabled', p.enabled,
    'integration_ready', p.integration_ready,
    'real_collection_allowed', p.real_collection_allowed,
    'adapter_version', p.adapter_version,
    'selected', p.provider_key = v_runtime.selected_provider_key
  ) order by p.created_at, p.provider_key), '[]'::jsonb)
  into v_providers
  from public.kinto_payment_providers_p2 p;

  return jsonb_build_object(
    'ok', true,
    'providers', v_providers,
    'selected_provider_key', v_runtime.selected_provider_key,
    'emergency_stop', v_runtime.emergency_stop,
    'emergency_reason', v_runtime.emergency_reason,
    'emergency_changed_at', v_runtime.emergency_changed_at,
    'effective_payment_mode', 'manual',
    'real_collection_allowed', false,
    'gateway_integration_ready', false
  );
end;
$p2_admin$;
revoke all on function public.kinto_payment_provider_admin_p2(text, text, text, boolean, text)
  from public;
grant execute on function public.kinto_payment_provider_admin_p2(text, text, text, boolean, text)
  to anon, authenticated;

-- Backend-only admission guard for future payment-start code. It is deliberately
-- callable only with service_role credentials and denies all P2 requests because
-- this phase has no live adapter, no production approval, and no real-payment path.
create or replace function public.kinto_payment_p2_assert_new_payment_allowed(p_provider_key text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $p2_gate$
declare
  v_runtime public.kinto_payment_runtime_p2%rowtype;
  v_provider public.kinto_payment_providers_p2%rowtype;
  v_payment public.kinto_payment_settings_g16%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_runtime
  from public.kinto_payment_runtime_p2
  where singleton = true
  for share;
  if not found then raise exception 'PAYMENT_RUNTIME_NOT_CONFIGURED' using errcode = '55000'; end if;
  if v_runtime.emergency_stop is true then
    raise exception 'NEW_PAYMENTS_EMERGENCY_STOPPED' using errcode = '55000';
  end if;
  select * into v_payment
  from public.kinto_payment_settings_g16
  where singleton = true
  for share;
  if not found or v_payment.payment_mode is distinct from 'electronic'
     or v_payment.gateways_enabled is not true then
    raise exception 'ELECTRONIC_COLLECTION_DISABLED' using errcode = '55000';
  end if;
  select * into v_provider
  from public.kinto_payment_providers_p2
  where provider_key = p_provider_key
  for share;
  if not found or v_provider.enabled is not true
     or v_provider.test_only is true
     or v_provider.integration_ready is not true
     or v_provider.real_collection_allowed is not true
     or v_runtime.selected_provider_key is distinct from p_provider_key then
    raise exception 'PROVIDER_NOT_READY' using errcode = '55000';
  end if;
  -- Current table constraints make reaching this branch impossible by design.
  return jsonb_build_object('allowed', true, 'provider_key', p_provider_key);
end;
$p2_gate$;
revoke all on function public.kinto_payment_p2_assert_new_payment_allowed(text)
  from public, anon, authenticated;
grant execute on function public.kinto_payment_p2_assert_new_payment_allowed(text)
  to service_role;

commit;
