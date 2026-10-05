-- G17: email OTP gate for creating employee/admin accounts from the admin panel.
-- Isolated storage only. Existing login/session/account RPCs are not replaced.
begin;
create table if not exists public.kinto_employee_email_challenges_g17(
 id uuid primary key default gen_random_uuid(),
 admin_id text not null,
 payload jsonb not null,
 code_hash text not null,
 expires_at timestamptz not null,
 attempts smallint not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.kinto_employee_email_challenges_g17 enable row level security;
revoke all on public.kinto_employee_email_challenges_g17 from public,anon,authenticated;
commit;
