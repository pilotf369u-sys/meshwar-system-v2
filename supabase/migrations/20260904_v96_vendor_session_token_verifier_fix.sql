-- V96 vendor session token verifier repair
-- The login RPC can create tokens through pgcrypto in the extensions schema.
-- Every later verifier/revoker must resolve the same digest implementation.

begin;

create or replace function private.require_vendor_session(
  p_session_token text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_store_id uuid;
  v_token_hash bytea;
begin
  if coalesce(length(p_session_token), 0) < 32 then
    raise exception 'VENDOR_SESSION_INVALID' using errcode = '28000';
  end if;

  v_token_hash := digest(p_session_token, 'sha256');

  select s.store_id
  into v_store_id
  from public.vendor_sessions s
  join public.local_stores ls on ls.id = s.store_id
  where s.token_hash = v_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and lower(trim(coalesce(ls.status, ''))) = 'active'
  limit 1;

  if v_store_id is null then
    raise exception 'VENDOR_SESSION_INVALID' using errcode = '28000';
  end if;

  update public.vendor_sessions
  set last_seen_at = now()
  where token_hash = v_token_hash;

  return v_store_id;
end;
$$;

create or replace function public.vendor_logout_session(
  p_session_token text
)
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_token_hash bytea;
begin
  if coalesce(p_session_token, '') = '' then
    return;
  end if;

  v_token_hash := digest(p_session_token, 'sha256');

  update public.vendor_sessions
  set revoked_at = coalesce(revoked_at, now())
  where token_hash = v_token_hash;
end;
$$;

revoke all on function public.vendor_logout_session(text) from public;
grant execute on function public.vendor_logout_session(text) to anon, authenticated;

commit;
