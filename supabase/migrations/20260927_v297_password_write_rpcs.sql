-- V297: bcrypt-only password write RPCs for existing account tables.
-- Stage 1 only: adds safe server-side password writers. It does not migrate existing passwords.
-- Existing login RPCs already accept bcrypt via pgcrypto crypt().

create extension if not exists pgcrypto;

create or replace function public.admin_set_account_password_v297(
  p_admin_session_token text,
  p_account_type text,
  p_account_id text,
  p_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin jsonb;
  v_type text := lower(trim(coalesce(p_account_type,'')));
  v_id text := trim(coalesce(p_account_id,''));
  v_password text := coalesce(p_password,'');
  v_rows integer := 0;
begin
  if v_id = '' or v_password = '' then
    return jsonb_build_object('ok',false,'error','PASSWORD_WRITE_REQUIRED');
  end if;
  if length(v_password) < 8 then
    return jsonb_build_object('ok',false,'error','PASSWORD_TOO_SHORT');
  end if;

  -- Reuse the verified V147 admin session identity; never trust a browser admin id.
  select public.admin_session_identity_v147(p_admin_session_token) into v_admin;
  if not coalesce((v_admin->>'ok')::boolean,false)
     or lower(trim(coalesce(v_admin->>'role',''))) not in ('admin','أدمن','ادمن') then
    return jsonb_build_object('ok',false,'error','ADMIN_SESSION_INVALID');
  end if;

  if v_type in ('employee','admin') then
    update public.employees set password = crypt(v_password, gen_salt('bf'))
    where id::text = v_id;
  elsif v_type = 'customer' then
    update public.customers set password = crypt(v_password, gen_salt('bf'))
    where id::text = v_id;
  elsif v_type = 'branch' then
    update public.branches set password = crypt(v_password, gen_salt('bf'))
    where id::text = v_id;
  elsif v_type in ('courier','delivery') then
    update public.couriers set password = crypt(v_password, gen_salt('bf'))
    where id::text = v_id;
  else
    return jsonb_build_object('ok',false,'error','PASSWORD_ACCOUNT_TYPE_INVALID');
  end if;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('ok',false,'error','PASSWORD_ACCOUNT_NOT_FOUND');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.admin_set_account_password_v297(text,text,text,text) from public;
grant execute on function public.admin_set_account_password_v297(text,text,text,text) to anon, authenticated;
