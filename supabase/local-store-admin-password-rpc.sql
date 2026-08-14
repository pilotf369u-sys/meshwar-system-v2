-- MeshWar Local Stores - secure admin save RPC
-- Password arrives from the admin UI as plain text over HTTPS and is hashed only inside PostgreSQL.

begin;

create extension if not exists pgcrypto;

create or replace function public.admin_save_local_store(
  p_admin_id uuid,
  p_store_id uuid,
  p_store_name text,
  p_logo_url text,
  p_username text,
  p_phone text,
  p_password text,
  p_country text,
  p_governorate text,
  p_store_type text,
  p_specialty text,
  p_default_currency text,
  p_commission_rate numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role text;
begin
  select lower(trim(role))
    into v_role
  from public.employees
  where id = p_admin_id
    and coalesce(is_active, true) = true
  limit 1;

  if v_role is distinct from 'admin' then
    raise exception 'Unauthorized admin';
  end if;

  if nullif(trim(p_store_name), '') is null then
    raise exception 'Store name is required';
  end if;

  if nullif(trim(p_username), '') is null then
    raise exception 'Username is required';
  end if;

  if p_commission_rate is null or p_commission_rate < 0 or p_commission_rate > 100 then
    raise exception 'Commission rate must be between 0 and 100';
  end if;

  if p_store_id is null then
    if nullif(p_password, '') is null then
      raise exception 'Password is required for a new store';
    end if;

    insert into public.local_stores (
      store_name,
      logo_url,
      username,
      phone,
      password_hash,
      country,
      governorate,
      store_type,
      specialty,
      default_currency,
      commission_rate,
      status
    ) values (
      trim(p_store_name),
      nullif(trim(p_logo_url), ''),
      trim(p_username),
      nullif(trim(p_phone), ''),
      crypt(p_password, gen_salt('bf')),
      nullif(trim(p_country), ''),
      nullif(trim(p_governorate), ''),
      coalesce(nullif(trim(p_store_type), ''), 'شامل'),
      coalesce(nullif(trim(p_specialty), ''), 'شامل'),
      coalesce(nullif(trim(p_default_currency), ''), 'USD'),
      p_commission_rate,
      'active'
    )
    returning id into v_store_id;
  else
    update public.local_stores
    set store_name = trim(p_store_name),
        logo_url = nullif(trim(p_logo_url), ''),
        username = trim(p_username),
        phone = nullif(trim(p_phone), ''),
        country = nullif(trim(p_country), ''),
        governorate = nullif(trim(p_governorate), ''),
        store_type = coalesce(nullif(trim(p_store_type), ''), store_type),
        specialty = coalesce(nullif(trim(p_specialty), ''), specialty),
        default_currency = coalesce(nullif(trim(p_default_currency), ''), default_currency),
        commission_rate = p_commission_rate,
        password_hash = case
          when nullif(p_password, '') is null then password_hash
          else crypt(p_password, gen_salt('bf'))
        end
    where id = p_store_id
    returning id into v_store_id;

    if v_store_id is null then
      raise exception 'Store not found';
    end if;
  end if;

  return v_store_id;
end;
$$;

revoke all on function public.admin_save_local_store(uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric) from public;
grant execute on function public.admin_save_local_store(uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric) to anon, authenticated;

commit;
