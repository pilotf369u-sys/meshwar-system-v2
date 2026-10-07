-- V300: same-role phone uniqueness guard for admin account writes.
-- Allows the same phone across different roles/tables, but rejects duplicates inside the same role.
-- Read-only checks before V297 write; no existing data is modified.

create or replace function public.admin_save_account_v300(
  p_admin_session_token text,
  p_account_type text,
  p_account_id text default null,
  p_name text default null,
  p_phone text default null,
  p_password text default null,
  p_role text default null,
  p_permissions jsonb default null,
  p_branch_id text default null,
  p_delivery_fee numeric default null,
  p_email text default null,
  p_code text default null,
  p_country text default null,
  p_state text default null,
  p_address text default null,
  p_secondary_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_admin jsonb;
  v_type text := lower(trim(coalesce(p_account_type,'')));
  v_id text := nullif(trim(coalesce(p_account_id,'')),'');
  v_phone text := lower(trim(coalesce(p_phone,'')));
  v_role text;
begin
  select public.admin_session_identity_v147(p_admin_session_token) into v_admin;
  if not coalesce((v_admin->>'ok')::boolean,false)
     or lower(trim(coalesce(v_admin->'admin'->>'role',''))) not in ('admin','أدمن','ادمن') then
    return jsonb_build_object('ok',false,'error','ADMIN_SESSION_INVALID');
  end if;

  if v_phone = '' then
    return jsonb_build_object('ok',false,'error','ACCOUNT_FIELDS_REQUIRED');
  end if;

  if v_type in ('employee','admin') then
    v_role := case when v_type='admin' then 'admin' else coalesce(nullif(lower(trim(p_role)),''),'employee') end;
    if exists (
      select 1 from public.employees e
      where lower(trim(coalesce(e.phone,''))) = v_phone
        and lower(trim(coalesce(e.role,''))) = v_role
        and (v_id is null or e.id::text <> v_id)
    ) then
      return jsonb_build_object('ok',false,'error','SAME_ROLE_PHONE_EXISTS');
    end if;
  elsif v_type='courier' then
    if exists (
      select 1 from public.couriers c
      where lower(trim(coalesce(c.phone,''))) = v_phone
        and (v_id is null or c.id::text <> v_id)
    ) then
      return jsonb_build_object('ok',false,'error','SAME_ROLE_PHONE_EXISTS');
    end if;
  elsif v_type='branch' then
    if exists (
      select 1 from public.branches b
      where lower(trim(coalesce(b.phone,''))) = v_phone
        and (v_id is null or b.id::text <> v_id)
    ) then
      return jsonb_build_object('ok',false,'error','SAME_ROLE_PHONE_EXISTS');
    end if;
  elsif v_type='customer' then
    if exists (
      select 1 from public.customers c
      where lower(trim(coalesce(c.phone,''))) = v_phone
        and (v_id is null or c.id::text <> v_id)
    ) then
      return jsonb_build_object('ok',false,'error','SAME_ROLE_PHONE_EXISTS');
    end if;
  else
    return jsonb_build_object('ok',false,'error','ACCOUNT_TYPE_INVALID');
  end if;

  return public.admin_save_account_v297(
    p_admin_session_token,p_account_type,p_account_id,p_name,p_phone,p_password,p_role,p_permissions,
    p_branch_id,p_delivery_fee,p_email,p_code,p_country,p_state,p_address,p_secondary_phone
  );
end;
$$;

revoke all on function public.admin_save_account_v300(text,text,text,text,text,text,text,jsonb,text,numeric,text,text,text,text,text,text) from public;
grant execute on function public.admin_save_account_v300(text,text,text,text,text,text,text,jsonb,text,numeric,text,text,text,text,text,text) to anon, authenticated;
