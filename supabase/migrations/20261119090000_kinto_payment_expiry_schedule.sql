-- Install only after the expiry Edge Function and its dedicated Vault secrets are ready.
begin;

create table if not exists private.kinto_payment_expiry_dispatch (
  request_id bigint primary key,
  queued_at timestamptz not null default clock_timestamp()
);
alter table private.kinto_payment_expiry_dispatch enable row level security;
revoke all on private.kinto_payment_expiry_dispatch from public, anon, authenticated, service_role;

create function private.kinto_payment_enqueue_expiry()
returns void language plpgsql
set search_path = pg_catalog
as $expiry$
declare
  origin text;
  hook_secret text;
  request_id bigint;
begin
  select decrypted_secret into strict origin
    from vault.decrypted_secrets where name = 'kinto_payment_expiry_origin';
  select decrypted_secret into strict hook_secret
    from vault.decrypted_secrets where name = 'kinto_payment_expiry_secret';
  if origin is null or origin !~ '^https://[a-z0-9]{20}\.supabase\.co$'
     or hook_secret is null or hook_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'KINTO_PAYMENT_EXPIRY_VAULT_CONFIG_INVALID';
  end if;

  request_id := net.http_post(
    url := origin || '/functions/v1/kinto-payment-expiry',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kinto-expiry-secret', hook_secret),
    timeout_milliseconds := 15000
  );
  insert into private.kinto_payment_expiry_dispatch values (request_id, clock_timestamp());
  delete from private.kinto_payment_expiry_dispatch where queued_at < clock_timestamp() - interval '7 days';
end;
$expiry$;
revoke all on function private.kinto_payment_enqueue_expiry() from public, anon, authenticated, service_role;

do $install$
declare origin text; hook_secret text;
begin
  if to_regprocedure('public.kinto_payment_attempt_expire_p4(integer)') is null
     or to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or to_regclass('vault.decrypted_secrets') is null
     or to_regclass('net.http_request_queue') is null
     or to_regclass('net._http_response') is null then
    raise exception 'KINTO_PAYMENT_EXPIRY_DEPENDENCY_MISSING';
  end if;
  select decrypted_secret into strict origin from vault.decrypted_secrets where name = 'kinto_payment_expiry_origin';
  select decrypted_secret into strict hook_secret from vault.decrypted_secrets where name = 'kinto_payment_expiry_secret';
  if origin is null or origin !~ '^https://[a-z0-9]{20}\.supabase\.co$'
     or hook_secret is null or hook_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'KINTO_PAYMENT_EXPIRY_VAULT_CONFIG_INVALID';
  end if;
  if has_column_privilege('anon', 'net.http_request_queue', 'headers', 'SELECT')
     or has_column_privilege('authenticated', 'net.http_request_queue', 'headers', 'SELECT')
     or has_column_privilege('anon', 'vault.decrypted_secrets', 'decrypted_secret', 'SELECT')
     or has_column_privilege('authenticated', 'vault.decrypted_secrets', 'decrypted_secret', 'SELECT') then
    raise exception 'KINTO_PAYMENT_EXPIRY_SECRET_NOT_PRIVATE';
  end if;
  if exists (select 1 from cron.job where jobname = 'kinto-payment-expiry-p4') then
    raise exception 'KINTO_PAYMENT_EXPIRY_JOB_ALREADY_EXISTS';
  end if;
  perform cron.schedule('kinto-payment-expiry-p4', '* * * * *',
    'select private.kinto_payment_enqueue_expiry()');
end;
$install$;

commit;
