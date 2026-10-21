-- Payment-P5 test preview: cap customer login sessions to 15 minutes.
-- This helper is backend-only and does not create or authenticate sessions.
begin;

create or replace function public.kinto_payment_p5_test_session_bound_v1(p_session_token text)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $session_bound$
declare
  v_expires_at timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if length(coalesce(p_session_token, '')) < 24 or length(p_session_token) > 512 then
    raise exception 'CUSTOMER_SESSION_INVALID' using errcode = '28000';
  end if;

  update public.customer_review_sessions
     set expires_at = least(expires_at, clock_timestamp() + interval '15 minutes')
   where token_hash = digest(p_session_token, 'sha256')
     and revoked_at is null
     and expires_at > clock_timestamp()
   returning expires_at into v_expires_at;

  if v_expires_at is null then
    raise exception 'CUSTOMER_SESSION_INVALID' using errcode = '28000';
  end if;
  return v_expires_at;
end;
$session_bound$;

revoke all on function public.kinto_payment_p5_test_session_bound_v1(text) from public, anon, authenticated;
grant execute on function public.kinto_payment_p5_test_session_bound_v1(text) to service_role;

commit;
