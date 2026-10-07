-- G16 email verification storage for financial destination changes.
begin;
create table if not exists public.kinto_payment_email_challenges_g16(
 id uuid primary key default gen_random_uuid(),
 admin_id text not null,
 method_id uuid references public.kinto_payment_methods_g16(id),
 payload jsonb not null,
 code_hash text not null,
 expires_at timestamptz not null,
 attempts smallint not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.kinto_payment_email_challenges_g16 enable row level security;
alter table public.kinto_payment_methods_g16 add column if not exists destination_verified_at timestamptz;
alter table public.kinto_payment_methods_g16 add column if not exists destination_verified_by text;
revoke all on public.kinto_payment_email_challenges_g16 from public,anon,authenticated;

-- Harden the original browser RPC: a browser session can no longer create or replace a manual financial destination.
create or replace function public.kinto_payment_admin_g16(
 p_session_token text,p_action text default 'list',p_id uuid default null,
 p_method_type text default null,p_label text default null,p_provider text default null,
 p_recipient_name text default null,p_account_reference text default null,
 p_instructions text default null,p_enabled boolean default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $g16$
declare v_admin text;v_row public.kinto_payment_methods_g16%rowtype;v_settings boolean;v_items jsonb;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_action='create' then
  if p_method_type='manual' then raise exception 'EMAIL_VERIFICATION_REQUIRED' using errcode='42501'; end if;
  if p_method_type<>'gateway' then raise exception 'INVALID_METHOD_TYPE' using errcode='22023'; end if;
  insert into public.kinto_payment_methods_g16(method_type,label,provider,is_enabled)
  values('gateway',btrim(coalesce(p_label,'')),btrim(coalesce(p_provider,'')),false) returning * into v_row;
 elsif p_action='update' then
  select * into v_row from public.kinto_payment_methods_g16 where id=p_id for update;
  if not found then raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode='P0002'; end if;
  if v_row.method_type='manual' and
   (coalesce(nullif(btrim(coalesce(p_recipient_name,'')),''),'')<>coalesce(v_row.recipient_name,'')
    or coalesce(nullif(btrim(coalesce(p_account_reference,'')),''),'')<>coalesce(v_row.account_reference,''))
  then raise exception 'EMAIL_VERIFICATION_REQUIRED' using errcode='42501'; end if;
  update public.kinto_payment_methods_g16 set label=btrim(coalesce(p_label,'')),provider=btrim(coalesce(p_provider,'')),
   instructions=case when method_type='manual' then nullif(btrim(coalesce(p_instructions,'')),'') else null end,updated_at=now()
  where id=p_id;
 elsif p_action='toggle' then
  select * into v_row from public.kinto_payment_methods_g16 where id=p_id for update;
  if not found then raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode='P0002'; end if;
  if v_row.method_type='gateway' and p_enabled is true then raise exception 'GATEWAY_INTEGRATION_NOT_DEPLOYED' using errcode='22023'; end if;
  if v_row.method_type='manual' and p_enabled is true and v_row.destination_verified_at is null then
   raise exception 'DESTINATION_NOT_VERIFIED' using errcode='42501'; end if;
  update public.kinto_payment_methods_g16 set is_enabled=coalesce(p_enabled,false),updated_at=now() where id=p_id;
 elsif p_action='gateway_switch' then
  if p_enabled is true then raise exception 'GATEWAY_INTEGRATION_NOT_DEPLOYED' using errcode='22023'; end if;
  update public.kinto_payment_settings_g16 set gateways_enabled=false,updated_at=now() where singleton=true;
 elsif p_action<>'list' then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
 select gateways_enabled into v_settings from public.kinto_payment_settings_g16 where singleton=true;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]'::jsonb) into v_items from
 (select id,method_type,label,provider,recipient_name,account_reference,instructions,is_enabled,created_at,destination_verified_at
  from public.kinto_payment_methods_g16) t;
 return jsonb_build_object('methods',v_items,'gateways_enabled',coalesce(v_settings,false),'gateway_integration_ready',false);
end;$g16$;
revoke all on function public.kinto_payment_admin_g16(text,text,uuid,text,text,text,text,text,text,boolean) from public;
grant execute on function public.kinto_payment_admin_g16(text,text,uuid,text,text,text,text,text,text,boolean) to anon,authenticated;
commit;
