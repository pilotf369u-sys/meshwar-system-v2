-- G16 / Phase 1: isolated admin payment-method catalogue ONLY.
-- Run manually after PR approval. No changes to orders, payment transitions, inventory or checkout.
begin;
create table if not exists public.kinto_payment_methods_g16 (
 id uuid primary key default gen_random_uuid(),
 method_type text not null check (method_type in ('manual','gateway')),
 label text not null check (char_length(btrim(label)) between 2 and 100),
 provider text not null check (char_length(btrim(provider)) between 2 and 80),
 recipient_name text,
 account_reference text,
 instructions text,
 is_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint g16_manual_fields check (
  (method_type='manual' and nullif(btrim(coalesce(account_reference,'')),'') is not null and char_length(account_reference)<=150)
  or (method_type='gateway' and account_reference is null and recipient_name is null and instructions is null and is_enabled=false)
 ),
 constraint g16_text_lengths check (
 char_length(coalesce(recipient_name,''))<=100 and char_length(coalesce(instructions,''))<=500
 )
);
create table if not exists public.kinto_payment_settings_g16 (
 singleton boolean primary key default true check (singleton),
 gateways_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.kinto_payment_settings_g16(singleton,gateways_enabled) values(true,false) on conflict do nothing;
alter table public.kinto_payment_methods_g16 enable row level security;
alter table public.kinto_payment_settings_g16 enable row level security;
revoke all on public.kinto_payment_methods_g16 from public,anon,authenticated;
revoke all on public.kinto_payment_settings_g16 from public,anon,authenticated;

create or replace function public.kinto_payment_admin_g16(
 p_session_token text, p_action text default 'list', p_id uuid default null,
 p_method_type text default null, p_label text default null, p_provider text default null,
 p_recipient_name text default null, p_account_reference text default null,
 p_instructions text default null, p_enabled boolean default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $g16$
declare v_admin text; v_row public.kinto_payment_methods_g16%rowtype; v_settings boolean; v_items jsonb;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_action='create' then
  if p_method_type not in ('manual','gateway') then raise exception 'INVALID_METHOD_TYPE' using errcode='22023'; end if;
  -- Gateway integrations are intentionally NOT available for activation in this phase.
  insert into public.kinto_payment_methods_g16(method_type,label,provider,recipient_name,account_reference,instructions,is_enabled)
  values(p_method_type,btrim(coalesce(p_label,'')),btrim(coalesce(p_provider,'')),
   case when p_method_type='manual' then nullif(btrim(coalesce(p_recipient_name,'')),'') else null end,
   case when p_method_type='manual' then nullif(btrim(coalesce(p_account_reference,'')),'') else null end,
   case when p_method_type='manual' then nullif(btrim(coalesce(p_instructions,'')),'') else null end,false)
  returning * into v_row;
 elsif p_action='update' then
  select * into v_row from public.kinto_payment_methods_g16 where id=p_id for update;
  if not found then raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode='P0002'; end if;
  update public.kinto_payment_methods_g16 set
   label=btrim(coalesce(p_label,'')),provider=btrim(coalesce(p_provider,'')),
   recipient_name=case when method_type='manual' then nullif(btrim(coalesce(p_recipient_name,'')),'') else null end,
   account_reference=case when method_type='manual' then nullif(btrim(coalesce(p_account_reference,'')),'') else null end,
   instructions=case when method_type='manual' then nullif(btrim(coalesce(p_instructions,'')),'') else null end,
   updated_at=now()
  where id=p_id;
 elsif p_action='toggle' then
  select * into v_row from public.kinto_payment_methods_g16 where id=p_id for update;
  if not found then raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode='P0002'; end if;
  if v_row.method_type='gateway' and p_enabled is true then
   raise exception 'GATEWAY_INTEGRATION_NOT_DEPLOYED' using errcode='22023';
  end if;
  update public.kinto_payment_methods_g16 set is_enabled=coalesce(p_enabled,false),updated_at=now() where id=p_id;
 elsif p_action='gateway_switch' then
  -- Prepared for a later separately reviewed gateway integration; cannot enable prematurely.
  if p_enabled is true then raise exception 'GATEWAY_INTEGRATION_NOT_DEPLOYED' using errcode='22023'; end if;
  update public.kinto_payment_settings_g16 set gateways_enabled=false,updated_at=now() where singleton=true;
 elsif p_action<>'list' then
  raise exception 'INVALID_ACTION' using errcode='22023';
 end if;
 select gateways_enabled into v_settings from public.kinto_payment_settings_g16 where singleton=true;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]'::jsonb) into v_items
 from (select id,method_type,label,provider,recipient_name,account_reference,instructions,is_enabled,created_at
 from public.kinto_payment_methods_g16) t;
 return jsonb_build_object('methods',v_items,'gateways_enabled',coalesce(v_settings,false),'gateway_integration_ready',false);
end;
$g16$;
revoke all on function public.kinto_payment_admin_g16(text,text,uuid,text,text,text,text,text,text,boolean) from public;
grant execute on function public.kinto_payment_admin_g16(text,text,uuid,text,text,text,text,text,text,boolean) to anon,authenticated;
commit;
