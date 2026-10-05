-- G19: independent security recovery foundation.
-- Recovery requires BOTH backup-email OTP and an offline recovery key.
-- Only the recovery-key hash is stored; the plaintext key must never be persisted.
begin;

create table if not exists public.kinto_security_recovery_g19 (
  singleton boolean primary key default true check (singleton),
  recovery_key_hash text not null,
  enabled boolean not null default true,
  configured_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_recovered_at timestamptz,
  last_recovered_by text
);

create table if not exists public.kinto_security_recovery_challenges_g19 (
  id uuid primary key default gen_random_uuid(),
  requested_by_admin_id text,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.kinto_security_audit_g19 (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_admin_id text,
  recovery_challenge_id uuid,
  created_at timestamptz not null default now()
);

alter table public.kinto_security_recovery_g19 enable row level security;
alter table public.kinto_security_recovery_challenges_g19 enable row level security;
alter table public.kinto_security_audit_g19 enable row level security;

revoke all on public.kinto_security_recovery_g19 from public,anon,authenticated;
revoke all on public.kinto_security_recovery_challenges_g19 from public,anon,authenticated;
revoke all on public.kinto_security_audit_g19 from public,anon,authenticated;

commit;
