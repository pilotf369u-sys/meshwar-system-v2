-- Verbatim validator from shipped v147; fixture only.
create or replace function private.require_admin_session_v147(p_session_token text)
returns text
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_admin_id text;
begin
  if trim(coalesce(p_session_token, '')) = '' then
    raise exception 'ADMIN_SESSION_REQUIRED';
  end if;

  select s.admin_id into v_admin_id
  from public.admin_sessions_v147 s
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_admin_id is null then
    raise exception 'ADMIN_SESSION_INVALID';
  end if;

  update public.admin_sessions_v147
  set last_seen_at = now()
  where token_hash = digest(p_session_token, 'sha256');

  return v_admin_id;
end;
$$;

revoke all on function private.require_admin_session_v147(text)
  from public, anon, authenticated;

