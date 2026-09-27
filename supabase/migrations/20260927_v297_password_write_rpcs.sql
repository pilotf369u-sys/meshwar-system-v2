-- V297: atomic bcrypt account writes for the existing account tables.
-- Stage 1: server-side create/update password paths only. Existing passwords are NOT migrated here.

create extension if not exists pgcrypto;

create or replace function public.admin_save_account_v297(
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
set search_path = public, pg_temp
as $$
declare
  v_admin jsonb;
  v_type text := lower(trim(coalesce(p_account_type,'')));
  v_id text := nullif(trim(coalesce(p_account_id,'')),'');
  v_password text := coalesce(p_password,'');
  v_hash text;
  v_created_id text;
  v_role text;
begin
  select public.admin_session_identity_v147(p_admin_session_token) into v_admin;
  if not coalesce((v_admin->>'ok')::boolean,false)
     or lower(trim(coalesce(v_admin->'admin'->>'role',''))) not in ('admin','أدمن','ادمن') then
    return jsonb_build_object('ok',false,'error','ADMIN_SESSION_INVALID');
  end if;

  if v_password <> '' and length(v_password) < 8 then
    return jsonb_build_object('ok',false,'error','PASSWORD_TOO_SHORT');
  end if;
  if v_id is null and v_password = '' then
    return jsonb_build_object('ok',false,'error','PASSWORD_REQUIRED');
  end if;
  if v_password <> '' then
    v_hash := crypt(v_password, gen_salt('bf'));
  end if;

  if v_type in ('employee','admin') then
    v_role := case when v_type='admin' then 'admin' else coalesce(nullif(lower(trim(p_role)),''),'employee') end;
    if v_role not in ('admin','employee') then
      return jsonb_build_object('ok',false,'error','ROLE_INVALID');
    end if;
    if nullif(trim(coalesce(p_name,'')),'') is null or nullif(trim(coalesce(p_phone,'')),'') is null then
      return jsonb_build_object('ok',false,'error','ACCOUNT_FIELDS_REQUIRED');
    end if;
    if v_id is null then
      insert into public.employees(name,phone,password,role,permissions)
      values(trim(p_name),trim(p_phone),v_hash,v_role,p_permissions)
      returning id::text into v_created_id;
    else
      update public.employees set
        name=trim(p_name), phone=trim(p_phone), role=v_role, permissions=p_permissions,
        password=case when v_hash is null then password else v_hash end
      where id::text=v_id returning id::text into v_created_id;
    end if;

  elsif v_type='courier' then
    if nullif(trim(coalesce(p_name,'')),'') is null
       or nullif(trim(coalesce(p_phone,'')),'') is null
       or nullif(trim(coalesce(p_branch_id,'')),'') is null then
      return jsonb_build_object('ok',false,'error','ACCOUNT_FIELDS_REQUIRED');
    end if;
    if v_id is null then
      insert into public.couriers(branch_id,name,phone,password,delivery_fee,is_active)
      values(trim(p_branch_id),trim(p_name),trim(p_phone),v_hash,p_delivery_fee,true)
      returning id::text into v_created_id;
    else
      update public.couriers set
        branch_id=trim(p_branch_id), name=trim(p_name), phone=trim(p_phone),
        delivery_fee=p_delivery_fee,
        password=case when v_hash is null then password else v_hash end
      where id::text=v_id returning id::text into v_created_id;
    end if;

  elsif v_type='branch' then
    if nullif(trim(coalesce(p_name,'')),'') is null
       or nullif(trim(coalesce(p_phone,'')),'') is null
       or nullif(trim(coalesce(p_address,'')),'') is null then
      return jsonb_build_object('ok',false,'error','ACCOUNT_FIELDS_REQUIRED');
    end if;
    if v_id is null then
      insert into public.branches(name,phone,password,address,status,payload)
      values(trim(p_name),trim(p_phone),v_hash,trim(p_address),'active','{}'::jsonb)
      returning id::text into v_created_id;
    else
      update public.branches set
        name=trim(p_name), phone=trim(p_phone), address=trim(p_address),
        password=case when v_hash is null then password else v_hash end
      where id::text=v_id returning id::text into v_created_id;
    end if;

  elsif v_type='customer' then
    if nullif(trim(coalesce(p_name,'')),'') is null
       or nullif(trim(coalesce(p_phone,'')),'') is null
       or nullif(trim(coalesce(p_country,'')),'') is null then
      return jsonb_build_object('ok',false,'error','ACCOUNT_FIELDS_REQUIRED');
    end if;
    if v_id is null then
      insert into public.customers(name,phone,password,email,code,country,state,address,secondary_phone)
      values(trim(p_name),trim(p_phone),v_hash,nullif(trim(coalesce(p_email,'')),''),
             nullif(trim(coalesce(p_code,'')),''),trim(p_country),
             nullif(trim(coalesce(p_state,'')),''),nullif(trim(coalesce(p_address,'')),''),
             nullif(trim(coalesce(p_secondary_phone,'')),''))
      returning id::text into v_created_id;
    else
      update public.customers set
        name=trim(p_name), phone=trim(p_phone), email=nullif(trim(coalesce(p_email,'')),''),
        code=coalesce(nullif(trim(coalesce(p_code,'')),''),code), country=trim(p_country),
        state=nullif(trim(coalesce(p_state,'')),''), address=nullif(trim(coalesce(p_address,'')),''),
        secondary_phone=nullif(trim(coalesce(p_secondary_phone,'')),''),
        password=case when v_hash is null then password else v_hash end
      where id::text=v_id returning id::text into v_created_id;
    end if;
  else
    return jsonb_build_object('ok',false,'error','ACCOUNT_TYPE_INVALID');
  end if;

  if v_created_id is null then
    return jsonb_build_object('ok',false,'error','ACCOUNT_NOT_FOUND');
  end if;
  return jsonb_build_object('ok',true,'id',v_created_id);
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error','IDENTITY_ALREADY_EXISTS');
end;
$$;

revoke all on function public.admin_save_account_v297(text,text,text,text,text,text,text,jsonb,text,numeric,text,text,text,text,text,text) from public;
grant execute on function public.admin_save_account_v297(text,text,text,text,text,text,text,jsonb,text,numeric,text,text,text,text,text,text) to anon, authenticated;
