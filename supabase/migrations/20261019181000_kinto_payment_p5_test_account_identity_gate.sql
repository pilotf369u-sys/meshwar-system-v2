-- A grant can target only the reserved P5T customer identity namespace. This
-- keeps a valid admin session from accidentally allowlisting an ordinary buyer.
begin;

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
    if not exists(select 1 from public.customers c where c.id::text=cid and c.phone like 'P5T-%') then
      raise exception 'P5_TEST_CUSTOMER_NOT_FOUND_OR_NOT_TEST' using errcode='P0002';
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

commit;
