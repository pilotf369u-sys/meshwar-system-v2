-- KINTO V304: verified branch courier account writes.
-- Additive only. Existing table privileges are intentionally unchanged in this stage.

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.branch_save_courier_v304(
  p_branch_session_token text,
  p_courier_id text default null,
  p_name text default null,
  p_phone text default null,
  p_password text default null,
  p_delivery_fee numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_branch_id text;
  v_id text := nullif(trim(coalesce(p_courier_id,'')),'');
  v_name text := trim(coalesce(p_name,''));
  v_phone text := trim(coalesce(p_phone,''));
  v_password text := coalesce(p_password,'');
  v_hash text;
  v_saved_id text;
begin
  v_branch_id := private.require_branch_session_v148(p_branch_session_token);

  if v_name = '' or v_phone = '' then
    return jsonb_build_object('ok',false,'error','ACCOUNT_FIELDS_REQUIRED');
  end if;
  if v_id is null and v_password = '' then
    return jsonb_build_object('ok',false,'error','PASSWORD_REQUIRED');
  end if;
  if v_password <> '' and length(v_password) < 8 then
    return jsonb_build_object('ok',false,'error','PASSWORD_TOO_SHORT');
  end if;

  if exists (
    select 1 from public.couriers c
    where trim(coalesce(c.phone,'')) = v_phone
      and (v_id is null or c.id::text <> v_id)
  ) then
    return jsonb_build_object('ok',false,'error','SAME_ROLE_PHONE_EXISTS');
  end if;

  if v_password <> '' then
    v_hash := crypt(v_password, gen_salt('bf'));
  end if;

  if v_id is null then
    insert into public.couriers(branch_id,name,phone,password,delivery_fee,is_active)
    values(v_branch_id,v_name,v_phone,v_hash,p_delivery_fee,true)
    returning id::text into v_saved_id;
  else
    update public.couriers
    set name=v_name,
        phone=v_phone,
        delivery_fee=p_delivery_fee,
        password=case when v_hash is null then password else v_hash end
    where id::text=v_id
      and branch_id::text=v_branch_id
    returning id::text into v_saved_id;
  end if;

  if v_saved_id is null then
    return jsonb_build_object('ok',false,'error','COURIER_NOT_FOUND_OR_NOT_OWNED');
  end if;

  return jsonb_build_object('ok',true,'id',v_saved_id);
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error','SAME_ROLE_PHONE_EXISTS');
end;
$$;

revoke all on function public.branch_save_courier_v304(text,text,text,text,text,numeric) from public;
grant execute on function public.branch_save_courier_v304(text,text,text,text,text,numeric) to anon, authenticated;

commit;
