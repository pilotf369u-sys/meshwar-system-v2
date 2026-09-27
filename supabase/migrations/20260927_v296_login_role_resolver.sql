-- V296: password-free login role resolver.
-- Resolves only the account namespace. It never accepts, reads, or returns a password.
-- Current production schema identities:
-- employees/admins: phone; branches: phone; couriers: phone;
-- customers: phone/code/email; vendors: phone/username.

create or replace function public.login_role_resolver_v296(p_identity text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity text := lower(trim(coalesce(p_identity, '')));
  v_role text;
  v_matches integer := 0;
  v_employee_role text;
begin
  if v_identity = '' then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_IDENTITY_REQUIRED');
  end if;

  select lower(trim(coalesce(e.role, '')))
    into v_employee_role
  from public.employees e
  where lower(trim(coalesce(e.phone, ''))) = v_identity
  limit 1;

  if v_employee_role is not null then
    v_matches := v_matches + 1;
    if v_employee_role in ('admin', 'أدمن', 'ادمن') then
      v_role := 'admin';
    elsif v_employee_role in ('employee', 'موظف') then
      v_role := 'employee';
    else
      return jsonb_build_object('ok', false, 'error', 'LOGIN_ROLE_UNSUPPORTED');
    end if;
  end if;

  if exists (
    select 1 from public.branches b
    where lower(trim(coalesce(b.phone, ''))) = v_identity
  ) then
    v_matches := v_matches + 1;
    v_role := coalesce(v_role, 'branch');
  end if;

  if exists (
    select 1 from public.couriers c
    where lower(trim(coalesce(c.phone, ''))) = v_identity
  ) then
    v_matches := v_matches + 1;
    v_role := coalesce(v_role, 'courier');
  end if;

  if exists (
    select 1 from public.customers c
    where lower(trim(coalesce(c.phone, ''))) = v_identity
       or lower(trim(coalesce(c.code, ''))) = v_identity
       or lower(trim(coalesce(c.email, ''))) = v_identity
  ) then
    v_matches := v_matches + 1;
    v_role := coalesce(v_role, 'customer');
  end if;

  if exists (
    select 1 from public.local_stores s
    where lower(trim(coalesce(s.phone, ''))) = v_identity
       or lower(trim(coalesce(s.username, ''))) = v_identity
  ) then
    v_matches := v_matches + 1;
    v_role := coalesce(v_role, 'vendor');
  end if;

  if v_matches = 0 then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_IDENTITY_NOT_FOUND');
  end if;

  if v_matches > 1 then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_IDENTITY_AMBIGUOUS');
  end if;

  return jsonb_build_object('ok', true, 'role', v_role);
end;
$$;

revoke all on function public.login_role_resolver_v296(text) from public;
grant execute on function public.login_role_resolver_v296(text) to anon, authenticated;
