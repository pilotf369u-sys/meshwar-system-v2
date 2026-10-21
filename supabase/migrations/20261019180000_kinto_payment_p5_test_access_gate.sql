-- P5: Explicit, time-bounded simulator access. This is not payment collection.
-- Only a verified KINTO admin session can grant test access. Customer sessions
-- can check eligibility through the service-only RPC, but cannot self-grant.
begin;

create table if not exists private.kinto_payment_test_accounts_p5 (
  customer_id text primary key,
  granted_by text not null,
  granted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > granted_at)
);
alter table private.kinto_payment_test_accounts_p5 enable row level security;
revoke all on table private.kinto_payment_test_accounts_p5 from public, anon, authenticated;

create or replace function public.kinto_payment_p5_test_access_admin_v1(
  p_admin_session_token text,
  p_customer_id text,
  p_enabled boolean,
  p_duration_minutes integer default 120
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp
as $admin$
declare aid text; cid text:=nullif(trim(coalesce(p_customer_id,'')),''); expiry timestamptz;
begin
  aid:=private.require_admin_session_v147(p_admin_session_token);
  if coalesce(aid,'')='' then raise exception 'INVALID_ADMIN_SESSION' using errcode='28000'; end if;
  if cid is null then raise exception 'P5_TEST_CUSTOMER_REQUIRED' using errcode='22023'; end if;
  if p_enabled is true then
    if p_duration_minutes is null or p_duration_minutes<1 or p_duration_minutes>1440 then
      raise exception 'P5_TEST_ACCESS_DURATION_INVALID' using errcode='22023';
    end if;
    if not exists(select 1 from public.customers c where c.id::text=cid) then
      raise exception 'P5_TEST_CUSTOMER_NOT_FOUND' using errcode='P0002';
    end if;
    expiry:=clock_timestamp()+make_interval(mins=>p_duration_minutes);
    insert into private.kinto_payment_test_accounts_p5(customer_id,granted_by,granted_at,expires_at,revoked_at)
      values(cid,aid,clock_timestamp(),expiry,null)
      on conflict(customer_id) do update set granted_by=excluded.granted_by,
        granted_at=excluded.granted_at,expires_at=excluded.expires_at,revoked_at=null;
    return jsonb_build_object('ok',true,'enabled',true,'customer_id',cid,'expires_at',expiry);
  end if;
  update private.kinto_payment_test_accounts_p5 set revoked_at=clock_timestamp()
    where customer_id=cid and revoked_at is null;
  return jsonb_build_object('ok',true,'enabled',false,'customer_id',cid);
end;
$admin$;
revoke all on function public.kinto_payment_p5_test_access_admin_v1(text,text,boolean,integer) from public;
grant execute on function public.kinto_payment_p5_test_access_admin_v1(text,text,boolean,integer) to anon,authenticated;

create or replace function public.kinto_payment_p5_test_access_check_v1(p_session_token text)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp
as $check$
declare cid uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  cid:=private.require_customer_review_session(p_session_token);
  if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  return exists(select 1 from private.kinto_payment_test_accounts_p5 t
    where t.customer_id=cid::text and t.revoked_at is null and t.expires_at>clock_timestamp());
end;
$check$;
revoke all on function public.kinto_payment_p5_test_access_check_v1(text) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_test_access_check_v1(text) to service_role;

-- The only client-reachable simulation entry point is service-role-only. Check
-- the allowlist here as defense in depth, before dispatching either ordinary or
-- direct-campaign simulations to their finalizers.
create or replace function public.kinto_payment_p5_simulate_dispatch_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $dispatch$
declare cid uuid; kind text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 cid:=private.require_customer_review_session(p_session_token);
 if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 if not exists(select 1 from private.kinto_payment_test_accounts_p5 t
   where t.customer_id=cid::text and t.revoked_at is null and t.expires_at>clock_timestamp()) then
   raise exception 'PAYMENT_P5_TEST_ACCESS_REQUIRED' using errcode='42501';
 end if;
 select payment_kind into kind from private.kinto_payments_p5
   where attempt_id=p_attempt_id and customer_id=cid::text;
 if not found then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if kind='campaign' then
   return public.kinto_payment_p5_campaign_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping);
 end if;
 return public.kinto_payment_p5_simulate_v1(p_session_token,p_attempt_id,p_scenario,p_event_key,p_shipping);
end;
$dispatch$;
revoke all on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_simulate_dispatch_v1(text,uuid,text,uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
