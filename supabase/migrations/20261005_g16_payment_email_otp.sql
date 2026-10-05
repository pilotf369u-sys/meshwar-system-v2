-- G16 email verification storage for financial destination changes.
begin;
create table if not exists public.kinto_payment_email_challenges_g16(
 id uuid primary key default gen_random_uuid(),
 admin_id text not null,
 method_id uuid references public.kinto_payment_methods_g16(id),
 payload jsonb not null,
 code_hash text not null,
 expires_at timestamptz not null,
 attempts smallint not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.kinto_payment_email_challenges_g16 enable row level security;
revoke all on public.kinto_payment_email_challenges_g16 from public,anon,authenticated;
commit;
