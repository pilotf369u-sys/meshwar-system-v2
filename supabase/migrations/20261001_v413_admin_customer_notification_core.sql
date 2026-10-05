-- V413: isolated customer-facing administrative notices. No order or reward changes.
create table if not exists public.kinto_customer_admin_notices (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 title text not null check (char_length(btrim(title)) between 2 and 160),
 body text not null check (char_length(btrim(body)) between 2 and 4000),
 kind text not null check (kind in ('announcement','campaign','discount','warning','policy')),
 created_by text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.kinto_customer_admin_notice_recipients (
 notice_id uuid not null references public.kinto_customer_admin_notices(id) on delete cascade,
 customer_id text not null,
 read_at timestamptz,
 primary key (notice_id,customer_id)
);
create index if not exists kinto_customer_admin_notice_recipient_feed_idx
 on public.kinto_customer_admin_notice_recipients(customer_id,notice_id);
alter table public.kinto_customer_admin_notices enable row level security;
alter table public.kinto_customer_admin_notice_recipients enable row level security;
revoke all on public.kinto_customer_admin_notices,public.kinto_customer_admin_notice_recipients from public,anon,authenticated;
