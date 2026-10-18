-- G16: Admin controls for the selected payment path. This is configuration only:
-- checkout remains on its current flow until a separately reviewed gateway is ready.
begin;

alter table public.kinto_payment_settings_g16
  add column if not exists payment_mode text not null default 'manual'
    check (payment_mode in ('manual','electronic')),
  add column if not exists gateway_environment text not null default 'sandbox'
    check (gateway_environment in ('sandbox','live'));

create table if not exists public.kinto_payment_settings_audit_g16 (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null check (action in ('payment_mode','gateway_environment','gateway_switch')),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
alter table public.kinto_payment_settings_audit_g16 enable row level security;
revoke all on public.kinto_payment_settings_audit_g16 from public,anon,authenticated;

create or replace function public.kinto_payment_mode_admin_g16(
  p_session_token text,
  p_action text default 'get',
  p_payment_mode text default null,
  p_gateway_environment text default null,
  p_enabled boolean default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $g16_mode$
declare
  v_admin text;
  v_settings public.kinto_payment_settings_g16%rowtype;
  v_old text;
  v_new text;
begin
  v_admin:=private.require_admin_session_v147(p_session_token);
  if nullif(btrim(v_admin),'') is null then
    raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000';
  end if;

  select * into v_settings
  from public.kinto_payment_settings_g16
  where singleton=true
  for update;
  if not found then
    insert into public.kinto_payment_settings_g16(singleton,gateways_enabled,payment_mode,gateway_environment)
    values(true,false,'manual','sandbox')
    returning * into v_settings;
  end if;

  if p_action='set_mode' then
    if p_payment_mode is null or p_payment_mode not in ('manual','electronic') then
      raise exception 'INVALID_PAYMENT_MODE' using errcode='22023';
    end if;
    v_old:=v_settings.payment_mode;
    v_new:=p_payment_mode;
    if v_old is distinct from v_new then
      update public.kinto_payment_settings_g16
      set payment_mode=v_new,updated_at=now()
      where singleton=true returning * into v_settings;
      insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'payment_mode',v_old,v_new);
    end if;
  elsif p_action='set_environment' then
    if p_gateway_environment is null or p_gateway_environment not in ('sandbox','live') then
      raise exception 'INVALID_GATEWAY_ENVIRONMENT' using errcode='22023';
    end if;
    -- Live credentials and adapter are not available in this phase.
    if p_gateway_environment='live' then
      raise exception 'GATEWAY_INTEGRATION_NOT_DEPLOYED' using errcode='22023';
    end if;
    v_old:=v_settings.gateway_environment;
    v_new:=p_gateway_environment;
    if v_old is distinct from v_new then
      update public.kinto_payment_settings_g16
      set gateway_environment=v_new,updated_at=now()
      where singleton=true returning * into v_settings;
      insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'gateway_environment',v_old,v_new);
    end if;
  elsif p_action='gateway_switch' then
    if p_enabled is null then raise exception 'INVALID_GATEWAY_STATE' using errcode='22023'; end if;
    if p_enabled then
      -- Enabling real collection requires a future reviewed adapter/deployment.
      raise exception 'GATEWAY_INTEGRATION_NOT_DEPLOYED' using errcode='22023';
    end if;
    v_old:=v_settings.gateways_enabled::text;
    v_new:=p_enabled::text;
    if v_settings.gateways_enabled is distinct from p_enabled then
      update public.kinto_payment_settings_g16
      set gateways_enabled=p_enabled,updated_at=now()
      where singleton=true returning * into v_settings;
      insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'gateway_switch',v_old,v_new);
    end if;
  elsif p_action<>'get' then
    raise exception 'INVALID_ACTION' using errcode='22023';
  end if;

  return jsonb_build_object(
    'payment_mode',v_settings.payment_mode,
    'gateway_environment',v_settings.gateway_environment,
    'gateways_enabled',v_settings.gateways_enabled,
    'gateway_integration_ready',false,
    'effective_payment_mode','manual'
  );
end;
$g16_mode$;

revoke all on function public.kinto_payment_mode_admin_g16(text,text,text,text,boolean) from public;
grant execute on function public.kinto_payment_mode_admin_g16(text,text,text,text,boolean) to anon,authenticated;

commit;
