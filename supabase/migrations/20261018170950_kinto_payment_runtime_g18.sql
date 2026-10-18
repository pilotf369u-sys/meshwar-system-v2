-- G18: server-enforced emergency stop and provider-pinned payment ledger.
-- This migration does not enable a live provider or alter the paid-order workflow.
begin;

alter table public.kinto_payment_settings_g16
  add column if not exists new_payments_paused boolean not null default true,
  add column if not exists new_payments_pause_reason text,
  add column if not exists new_payments_paused_by text,
  add column if not exists new_payments_paused_at timestamptz,
  add column if not exists active_gateway_provider text;

alter table public.kinto_payment_settings_audit_g16
  drop constraint if exists kinto_payment_settings_audit_g16_action_check;
alter table public.kinto_payment_settings_audit_g16
  add constraint kinto_payment_settings_audit_g16_action_check
  check (action in ('payment_mode','gateway_environment','gateway_switch','emergency_pause','provider_select','provider_pause'));

create table if not exists public.kinto_payment_gateway_providers_g18 (
  provider_key text primary key check (provider_key ~ '^[a-z][a-z0-9_-]{1,47}$'),
  display_name text not null check (length(display_name) between 1 and 100),
  checkout_protocol text not null check (checkout_protocol in ('hosted_checkout','api','sdk')),
  adapter_version text not null check (length(adapter_version) between 1 and 80),
  environment text not null default 'sandbox' check (environment in ('sandbox','live')),
  enabled boolean not null default false,
  new_payments_paused boolean not null default true,
  pause_reason text,
  paused_by text,
  paused_at timestamptz,
  secret_name text,
  public_config jsonb not null default '{}'::jsonb check (jsonb_typeof(public_config)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (secret_name is null or secret_name !~* '(key|secret|token|password)\s*[:=]')
);
alter table public.kinto_payment_settings_g16
  add constraint kinto_payment_settings_active_provider_g18_fk
  foreign key (active_gateway_provider) references public.kinto_payment_gateway_providers_g18(provider_key);
alter table public.kinto_payment_gateway_providers_g18 enable row level security;
revoke all on public.kinto_payment_gateway_providers_g18 from public,anon,authenticated;

create table if not exists public.kinto_payment_intents_g18 (
  id uuid primary key default gen_random_uuid(),
  payment_reference text not null unique default ('KP-' || upper(replace(gen_random_uuid()::text,'-',''))),
  customer_id text not null,
  quote_id uuid not null,
  checkout_group_id uuid,
  provider_key text not null references public.kinto_payment_gateway_providers_g18(provider_key),
  provider_environment text not null check (provider_environment in ('sandbox','live')),
  provider_adapter_version text not null,
  provider_reference text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'created' check (status in ('created','pending','authorized','captured','reconciliation_required','failed','cancelled','partially_refunded','refunded')),
  idempotency_key text not null check (length(idempotency_key) between 12 and 160),
  reservation_expires_at timestamptz,
  provider_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_snapshot)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id,idempotency_key)
);
create unique index if not exists kinto_payment_intents_provider_reference_g18_uq
  on public.kinto_payment_intents_g18(provider_key,provider_reference)
  where provider_reference is not null;
create index if not exists kinto_payment_intents_customer_created_g18_idx
  on public.kinto_payment_intents_g18(customer_id,created_at desc,id desc);
alter table public.kinto_payment_intents_g18 enable row level security;
revoke all on public.kinto_payment_intents_g18 from public,anon,authenticated;

create or replace function public.kinto_payment_intent_identity_guard_g18()
returns trigger language plpgsql set search_path=pg_catalog,public as $g18_identity$
begin
  if new.provider_key is distinct from old.provider_key
     or new.provider_environment is distinct from old.provider_environment
     or new.provider_adapter_version is distinct from old.provider_adapter_version
     or new.customer_id is distinct from old.customer_id
     or new.quote_id is distinct from old.quote_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency then
    raise exception 'PAYMENT_INTENT_IDENTITY_IMMUTABLE' using errcode='23514';
  end if;
  if old.provider_reference is not null and new.provider_reference is distinct from old.provider_reference then
    raise exception 'PROVIDER_REFERENCE_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end;
$g18_identity$;
create trigger trg_kinto_payment_intent_identity_guard_g18
  before update on public.kinto_payment_intents_g18
  for each row execute function public.kinto_payment_intent_identity_guard_g18();

create table if not exists public.kinto_payment_gateway_events_g18 (
  id bigint generated always as identity primary key,
  provider_key text not null references public.kinto_payment_gateway_providers_g18(provider_key),
  provider_event_id text not null,
  intent_id uuid references public.kinto_payment_intents_g18(id),
  event_type text not null,
  event_fingerprint text not null,
  signature_verified boolean not null default false,
  amount_minor bigint,
  currency text,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored_duplicate','reconciliation_required','rejected')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider_key,provider_event_id)
);
alter table public.kinto_payment_gateway_events_g18 enable row level security;
revoke all on public.kinto_payment_gateway_events_g18 from public,anon,authenticated;

create table if not exists public.kinto_payment_financial_events_g18 (
  id bigint generated always as identity primary key,
  intent_id uuid not null references public.kinto_payment_intents_g18(id),
  event_kind text not null check (event_kind in ('capture','settlement','refund_requested','refund_succeeded','refund_failed','reconciliation')),
  provider_key text not null,
  provider_reference text,
  provider_event_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);
alter table public.kinto_payment_financial_events_g18 enable row level security;
revoke all on public.kinto_payment_financial_events_g18 from public,anon,authenticated;

create or replace function public.kinto_payment_runtime_admin_g18(
  p_session_token text,
  p_action text default 'get',
  p_paused boolean default null,
  p_reason text default null,
  p_provider_key text default null,
  p_payment_mode text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $g18_runtime$
declare
  v_admin text;
  v_settings public.kinto_payment_settings_g16%rowtype;
  v_provider public.kinto_payment_gateway_providers_g18%rowtype;
  v_old text;
  v_new text;
begin
  v_admin:=private.require_admin_session_v147(p_session_token);
  if nullif(btrim(v_admin),'') is null then
    raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000';
  end if;

  select * into v_settings from public.kinto_payment_settings_g16 where singleton=true for update;
  if not found then
    insert into public.kinto_payment_settings_g16(singleton,gateways_enabled,payment_mode,gateway_environment,new_payments_paused)
    values(true,false,'manual','sandbox',true) returning * into v_settings;
  end if;

  if p_action='set_mode' then
    if p_payment_mode is null or p_payment_mode not in ('manual','electronic') then
      raise exception 'INVALID_PAYMENT_MODE' using errcode='22023';
    end if;
    v_old:=v_settings.payment_mode;
    v_new:=p_payment_mode;
    if v_settings.payment_mode is distinct from v_new then
      update public.kinto_payment_settings_g16
        set payment_mode=v_new,
            new_payments_paused=case when v_new='electronic' then new_payments_paused else true end,
            new_payments_pause_reason=case when v_new='electronic' then new_payments_pause_reason else 'Returned to manual payment mode' end,
            new_payments_paused_by=case when v_new='electronic' then new_payments_paused_by else v_admin end,
            new_payments_paused_at=case when v_new='electronic' then new_payments_paused_at else now() end,
            gateways_enabled=case when v_new='electronic' then gateways_enabled else false end,
            updated_at=now()
        where singleton=true returning * into v_settings;
      insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
        values(v_admin,'payment_mode',v_old,v_new);
    end if;
  elsif p_action='emergency_pause' then
    if p_paused is null then raise exception 'PAUSE_STATE_REQUIRED' using errcode='22023'; end if;
    if p_paused and length(btrim(coalesce(p_reason,'')))<8 then
      raise exception 'PAUSE_REASON_REQUIRED' using errcode='22023';
    end if;
    -- Re-enabling is intentionally a separate, explicit action.
    if not p_paused then raise exception 'USE_RESUME_ACTION' using errcode='22023'; end if;
    v_old:=v_settings.new_payments_paused::text;
    update public.kinto_payment_settings_g16
      set new_payments_paused=true,
          new_payments_pause_reason=left(btrim(p_reason),500),
          new_payments_paused_by=v_admin,
          new_payments_paused_at=now(),
          gateways_enabled=false,
          updated_at=now()
      where singleton=true returning * into v_settings;
    insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'emergency_pause',v_old,'true: '||left(btrim(p_reason),500));
  elsif p_action='resume_new_payments' then
    if v_settings.payment_mode<>'electronic' or v_settings.gateway_environment<>'sandbox'
       or not exists(select 1 from public.kinto_payment_gateway_providers_g18 p
                     where p.provider_key=v_settings.active_gateway_provider and p.enabled
                       and p.environment='sandbox' and not p.new_payments_paused) then
      raise exception 'GATEWAY_NOT_READY' using errcode='22023';
    end if;
    v_old:=v_settings.new_payments_paused::text;
    update public.kinto_payment_settings_g16
      set new_payments_paused=false,new_payments_pause_reason=null,new_payments_paused_by=v_admin,
          new_payments_paused_at=now(),gateways_enabled=true,updated_at=now()
      where singleton=true returning * into v_settings;
    if v_old is distinct from 'false' then
      insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'gateway_switch',v_old,'false');
    end if;
  elsif p_action='select_provider' then
    if p_provider_key is null or not exists(select 1 from public.kinto_payment_gateway_providers_g18 p
       where p.provider_key=p_provider_key and p.enabled and p.environment=v_settings.gateway_environment) then
      raise exception 'PROVIDER_NOT_READY' using errcode='22023';
    end if;
    v_old:=coalesce(v_settings.active_gateway_provider,'');
    update public.kinto_payment_settings_g16 set active_gateway_provider=p_provider_key,
      new_payments_paused=true,gateways_enabled=false,updated_at=now()
      where singleton=true returning * into v_settings;
    insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'provider_select',v_old,p_provider_key);
  elsif p_action in ('pause_provider','resume_provider') then
    if p_provider_key is null then raise exception 'PROVIDER_REQUIRED' using errcode='22023'; end if;
    if p_action='pause_provider' and length(btrim(coalesce(p_reason,'')))<8 then
      raise exception 'PAUSE_REASON_REQUIRED' using errcode='22023';
    end if;
    if p_action='resume_provider' and (v_settings.payment_mode<>'electronic'
       or v_settings.gateway_environment<>'sandbox'
       or not exists(select 1 from public.kinto_payment_gateway_providers_g18 p
                     where p.provider_key=p_provider_key and p.enabled and p.environment='sandbox')) then
      raise exception 'PROVIDER_NOT_READY' using errcode='22023';
    end if;
    select * into v_provider from public.kinto_payment_gateway_providers_g18 where provider_key=p_provider_key for update;
    if not found then raise exception 'PROVIDER_NOT_FOUND' using errcode='22023'; end if;
    v_old:=p_provider_key||':'||v_provider.new_payments_paused::text;
    update public.kinto_payment_gateway_providers_g18
       set new_payments_paused=(p_action='pause_provider'),
           pause_reason=case when p_action='pause_provider' then left(btrim(p_reason),500) else null end,
           paused_by=v_admin,paused_at=now(),updated_at=now()
     where provider_key=p_provider_key;
    insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
      values(v_admin,'provider_pause',v_old,
        p_provider_key||':'||(p_action='pause_provider')::text||case when p_action='pause_provider' then ':'||left(btrim(p_reason),500) else '' end);
  elsif p_action<>'get' then
    raise exception 'INVALID_ACTION' using errcode='22023';
  end if;

  return jsonb_build_object(
    'payment_mode',v_settings.payment_mode,
    'gateway_environment',v_settings.gateway_environment,
    'gateways_enabled',v_settings.gateways_enabled,
    'new_payments_paused',v_settings.new_payments_paused,
    'pause_reason',v_settings.new_payments_pause_reason,
    'active_gateway_provider',v_settings.active_gateway_provider,
    'active_provider_paused',coalesce((select p.new_payments_paused from public.kinto_payment_gateway_providers_g18 p
                                       where p.provider_key=v_settings.active_gateway_provider),true),
    'active_provider_pause_reason',(select p.pause_reason from public.kinto_payment_gateway_providers_g18 p
                                   where p.provider_key=v_settings.active_gateway_provider),
    'gateway_integration_ready',false,
    'effective_payment_mode','manual'
  );
end;
$g18_runtime$;
revoke all on function public.kinto_payment_runtime_admin_g18(text,text,boolean,text,text,text) from public;
grant execute on function public.kinto_payment_runtime_admin_g18(text,text,boolean,text,text,text) to anon,authenticated;

-- Service-role-only admission gate. SELECT ... FOR UPDATE serializes session creation
-- with emergency pause/resume so no creation can pass a pause committed first.
create or replace function public.kinto_payment_admit_intent_g18(
  p_customer_id text,
  p_quote_id uuid,
  p_provider_key text,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key text,
  p_reservation_expires_at timestamptz,
  p_provider_snapshot jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $g18_admit$
declare
  v_settings public.kinto_payment_settings_g16%rowtype;
  v_provider public.kinto_payment_gateway_providers_g18%rowtype;
  v_intent public.kinto_payment_intents_g18%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
  if nullif(btrim(p_customer_id),'') is null or p_quote_id is null
     or p_amount_minor<=0 or p_currency !~ '^[A-Z]{3}$'
     or length(coalesce(p_idempotency_key,'')) not between 12 and 160 then
    raise exception 'INVALID_PAYMENT_INTENT' using errcode='22023';
  end if;

  select * into v_settings from public.kinto_payment_settings_g16 where singleton=true for update;
  if not found or v_settings.payment_mode<>'electronic' or v_settings.gateways_enabled is not true
     or v_settings.new_payments_paused is true or v_settings.active_gateway_provider is distinct from p_provider_key then
    raise exception 'NEW_PAYMENTS_PAUSED' using errcode='55000';
  end if;
  select * into v_provider from public.kinto_payment_gateway_providers_g18
    where provider_key=p_provider_key and enabled and environment=v_settings.gateway_environment for share;
  if not found or v_provider.new_payments_paused then raise exception 'PROVIDER_NOT_READY' using errcode='55000'; end if;

  select * into v_intent from public.kinto_payment_intents_g18
    where customer_id=p_customer_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_intent.quote_id is distinct from p_quote_id or v_intent.amount_minor is distinct from p_amount_minor
       or v_intent.currency is distinct from p_currency or v_intent.provider_key is distinct from p_provider_key then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
    end if;
    return jsonb_build_object('ok',true,'existing',true,'intent_id',v_intent.id,'payment_reference',v_intent.payment_reference,
      'provider_key',v_intent.provider_key,'provider_reference',v_intent.provider_reference,'status',v_intent.status);
  end if;
  insert into public.kinto_payment_intents_g18(customer_id,quote_id,provider_key,provider_environment,
    provider_adapter_version,amount_minor,currency,idempotency_key,reservation_expires_at,provider_snapshot,status)
  values(p_customer_id,p_quote_id,v_provider.provider_key,v_provider.environment,v_provider.adapter_version,
    p_amount_minor,p_currency,p_idempotency_key,p_reservation_expires_at,
    coalesce(p_provider_snapshot,'{}'::jsonb)||jsonb_build_object('checkout_protocol',v_provider.checkout_protocol),'created')
  returning * into v_intent;
  return jsonb_build_object('ok',true,'existing',false,'intent_id',v_intent.id,'payment_reference',v_intent.payment_reference,
    'provider_key',v_intent.provider_key,'provider_reference',null,'status',v_intent.status);
end;
$g18_admit$;
revoke all on function public.kinto_payment_admit_intent_g18(text,uuid,text,bigint,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_admit_intent_g18(text,uuid,text,bigint,text,text,timestamptz,jsonb) to service_role;
revoke all on function public.kinto_payment_intent_identity_guard_g18() from public,anon,authenticated;

commit;
