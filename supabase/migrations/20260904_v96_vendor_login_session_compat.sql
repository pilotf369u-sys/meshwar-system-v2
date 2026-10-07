-- V96 vendor secure-session login compatibility
-- Keeps public.vendor_login as the single password-verification authority,
-- then creates the short-lived V95 session only after that RPC succeeds.

begin;

create or replace function public.vendor_login_session(
  p_identity text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_store_id uuid;
  v_store public.local_stores%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if trim(coalesce(p_identity, '')) = '' or coalesce(p_password, '') = '' then
    raise exception 'بيانات الدخول غير مكتملة' using errcode = '28000';
  end if;

  -- Do not duplicate password/hash compatibility here. The established login
  -- RPC already supports the production account formats (legacy and bcrypt).
  select authenticated_store.id
  into v_store_id
  from public.vendor_login(trim(p_identity), p_password) authenticated_store
  limit 1;

  if v_store_id is null then
    raise exception 'بيانات الدخول غير صحيحة أو المتجر غير نشط'
      using errcode = '28000';
  end if;

  select s.*
  into v_store
  from public.local_stores s
  where s.id = v_store_id
    and lower(trim(coalesce(s.status, ''))) = 'active'
  limit 1;

  if v_store.id is null then
    raise exception 'بيانات الدخول غير صحيحة أو المتجر غير نشط'
      using errcode = '28000';
  end if;

  delete from public.vendor_sessions
  where expires_at <= now() or revoked_at is not null;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.vendor_sessions(store_id, token_hash, expires_at)
  values(v_store.id, digest(v_token, 'sha256'), v_expires_at);

  return jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expires_at,
    'store', jsonb_build_object(
      'id', v_store.id,
      'store_name', v_store.store_name,
      'logo_url', v_store.logo_url,
      'username', v_store.username,
      'phone', v_store.phone,
      'country', v_store.country,
      'governorate', v_store.governorate,
      'store_type', v_store.store_type,
      'specialty', v_store.specialty,
      'default_currency', v_store.default_currency,
      'commission_rate', v_store.commission_rate,
      'status', v_store.status,
      'exchange_rate', v_store.exchange_rate,
      'exchange_base_currency', v_store.exchange_base_currency,
      'exchange_target_currency', v_store.exchange_target_currency
    )
  );
end;
$$;

revoke all on function public.vendor_login_session(text, text) from public;
grant execute on function public.vendor_login_session(text, text) to anon, authenticated;

commit;
