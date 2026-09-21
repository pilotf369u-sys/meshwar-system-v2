-- KINTO V144: repair the already-installed V143 employee session runtime.
-- Configuration-only: no employee, order, invoice, message, or customer rows change.

begin;

create extension if not exists pgcrypto with schema extensions;

alter function private.require_employee_session_v143(text)
  set search_path = public, private, extensions, pg_temp;

alter function public.employee_login_v143(text, text)
  set search_path = public, private, extensions, pg_temp;

alter function public.employee_session_identity_v143(text)
  set search_path = public, private, extensions, pg_temp;

alter function public.employee_logout_v143(text)
  set search_path = public, private, extensions, pg_temp;

create or replace function public.employee_login_v143(
  p_identity text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_employee_json jsonb;
  v_employee_id text;
  v_role text;
  v_stored_password text;
  v_password_ok boolean := false;
  v_active boolean := true;
  v_token text;
  v_expires_at timestamptz := now() + interval '8 hours';
  v_identity_normalized text;
  v_identity_hash bytea;
  v_failed_attempts integer;
begin
  if trim(coalesce(p_identity, '')) = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'EMPLOYEE_LOGIN_FIELDS_REQUIRED');
  end if;

  v_identity_normalized := lower(trim(p_identity));
  v_identity_hash := digest(v_identity_normalized, 'sha256');

  perform pg_advisory_xact_lock(
    hashtextextended(encode(v_identity_hash, 'hex'), 144)
  );

  delete from public.employee_login_attempts_v143
  where attempted_at < now() - interval '24 hours';

  select count(*)::integer into v_failed_attempts
  from public.employee_login_attempts_v143 a
  where a.identity_hash = v_identity_hash
    and a.attempted_at >= now() - interval '15 minutes';

  if v_failed_attempts >= 5 then
    return jsonb_build_object(
      'ok', false,
      'error', 'EMPLOYEE_LOGIN_RATE_LIMITED',
      'retry_after_seconds', 900
    );
  end if;

  select to_jsonb(e) into v_employee_json
  from public.employees e
  where trim(coalesce(to_jsonb(e) ->> 'phone', '')) = trim(p_identity)
     or lower(trim(coalesce(to_jsonb(e) ->> 'code', ''))) = v_identity_normalized
     or lower(trim(coalesce(to_jsonb(e) ->> 'email', ''))) = v_identity_normalized
  limit 1;

  v_employee_id := coalesce(v_employee_json ->> 'id', '');
  v_role := lower(trim(coalesce(v_employee_json ->> 'role', '')));

  if v_employee_id = '' or v_role not in ('employee', 'موظف') then
    insert into public.employee_login_attempts_v143(identity_hash)
    values (v_identity_hash);
    if v_failed_attempts + 1 >= 5 then
      return jsonb_build_object('ok', false, 'error', 'EMPLOYEE_LOGIN_RATE_LIMITED', 'retry_after_seconds', 900);
    end if;
    return jsonb_build_object('ok', false, 'error', 'EMPLOYEE_LOGIN_INVALID');
  end if;

  if lower(coalesce(v_employee_json ->> 'is_active', 'true')) in ('false', '0')
     or lower(coalesce(v_employee_json ->> 'active', 'true')) in ('false', '0')
     or lower(coalesce(v_employee_json ->> 'disabled', 'false')) in ('true', '1') then
    v_active := false;
  end if;

  if not v_active then
    return jsonb_build_object('ok', false, 'error', 'EMPLOYEE_LOGIN_DISABLED');
  end if;

  v_stored_password := coalesce(v_employee_json ->> 'password', '');
  if v_stored_password ~ '^\$2[aby]\$' then
    begin
      v_password_ok := crypt(p_password, v_stored_password) = v_stored_password;
    exception when others then
      v_password_ok := false;
    end;
  elsif v_stored_password = p_password then
    v_password_ok := true;
  end if;

  if not v_password_ok then
    insert into public.employee_login_attempts_v143(identity_hash)
    values (v_identity_hash);
    if v_failed_attempts + 1 >= 5 then
      return jsonb_build_object('ok', false, 'error', 'EMPLOYEE_LOGIN_RATE_LIMITED', 'retry_after_seconds', 900);
    end if;
    return jsonb_build_object('ok', false, 'error', 'EMPLOYEE_LOGIN_INVALID');
  end if;

  delete from public.employee_login_attempts_v143
  where identity_hash = v_identity_hash;

  delete from public.employee_sessions_v143
  where employee_id = v_employee_id
    and (expires_at <= now() or revoked_at is not null);

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.employee_sessions_v143(employee_id, token_hash, expires_at)
  values (v_employee_id, digest(v_token, 'sha256'), v_expires_at);

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'expires_at', v_expires_at,
    'employee', jsonb_strip_nulls(jsonb_build_object(
      'id', v_employee_id,
      'name', v_employee_json ->> 'name',
      'phone', v_employee_json ->> 'phone',
      'role', v_employee_json ->> 'role',
      'permissions', v_employee_json -> 'permissions'
    ))
  );
end;
$$;

revoke all on function public.employee_login_v143(text, text) from public;
grant execute on function public.employee_login_v143(text, text) to anon, authenticated;

commit;
