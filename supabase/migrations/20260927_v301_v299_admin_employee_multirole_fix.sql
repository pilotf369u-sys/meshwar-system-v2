-- V301: patch V299 employee-table role discovery for shared phone across admin + employee.
-- Password-free resolver only. No account/order/message data is modified.

create or replace function public.login_role_resolver_v299(p_identity text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity text := lower(trim(coalesce(p_identity, '')));
  v_roles text[] := array[]::text[];
begin
  if v_identity = '' then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_IDENTITY_REQUIRED');
  end if;

  if exists (
    select 1 from public.employees e
    where lower(trim(coalesce(e.phone, ''))) = v_identity
      and lower(trim(coalesce(e.role, ''))) in ('admin', 'أدمن', 'ادمن')
  ) then
    v_roles := array_append(v_roles, 'admin');
  end if;

  if exists (
    select 1 from public.employees e
    where lower(trim(coalesce(e.phone, ''))) = v_identity
      and lower(trim(coalesce(e.role, ''))) in ('employee', 'موظف')
  ) then
    v_roles := array_append(v_roles, 'employee');
  end if;

  if exists (
    select 1 from public.employees e
    where lower(trim(coalesce(e.phone, ''))) = v_identity
      and lower(trim(coalesce(e.role, ''))) not in ('admin','أدمن','ادمن','employee','موظف')
  ) then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_ROLE_UNSUPPORTED');
  end if;

  if exists (select 1 from public.branches b where lower(trim(coalesce(b.phone, ''))) = v_identity) then
    v_roles := array_append(v_roles, 'branch');
  end if;

  if exists (select 1 from public.couriers c where lower(trim(coalesce(c.phone, ''))) = v_identity) then
    v_roles := array_append(v_roles, 'courier');
  end if;

  if exists (
    select 1 from public.customers c
    where lower(trim(coalesce(c.phone, ''))) = v_identity
       or lower(trim(coalesce(c.code, ''))) = v_identity
       or lower(trim(coalesce(c.email, ''))) = v_identity
  ) then
    v_roles := array_append(v_roles, 'customer');
  end if;

  if exists (
    select 1 from public.local_stores s
    where lower(trim(coalesce(s.phone, ''))) = v_identity
       or lower(trim(coalesce(s.username, ''))) = v_identity
  ) then
    v_roles := array_append(v_roles, 'vendor');
  end if;

  if cardinality(v_roles) = 0 then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_IDENTITY_NOT_FOUND');
  end if;

  if cardinality(v_roles) = 1 then
    return jsonb_build_object('ok', true, 'role', v_roles[1], 'roles', to_jsonb(v_roles));
  end if;

  return jsonb_build_object('ok', true, 'roles', to_jsonb(v_roles), 'requires_role_choice', true);
end;
$$;

revoke all on function public.login_role_resolver_v299(text) from public;
grant execute on function public.login_role_resolver_v299(text) to anon, authenticated;
