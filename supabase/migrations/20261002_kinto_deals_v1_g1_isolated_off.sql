-- KINTO DEALS G1: additive isolated schema. NOT an activation migration.
-- Run manually only after PR approval and preflight. No hooks on orders,
-- checkout, existing campaigns, stock, shipping, invoices or auth.
begin;
create extension if not exists pgcrypto;

create table if not exists public.kinto_deals_v1_flags (
  key text primary key check (key = 'merchant_deals_enabled'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.kinto_deals_v1_flags(key, enabled)
values ('merchant_deals_enabled', false)
on conflict (key) do nothing;

create table if not exists public.kinto_deals_v1_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.local_stores(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  kind text not null check (kind in ('choose_n','buy_n','limited_purchase')),
  status text not null default 'draft'
    check (status in ('draft','submitted','active','paused','expired','rejected','archived')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  threshold_units integer check (threshold_units between 1 and 100),
  gift_product_id uuid references public.local_products(id) on delete restrict,
  gift_selected_options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(gift_selected_options) = 'object'),
  max_uses_per_customer integer not null default 1
    check (max_uses_per_customer between 1 and 100),
  max_units_per_customer integer
    check (max_units_per_customer between 1 and 1000),
  max_total_redemptions integer
    check (max_total_redemptions between 1 and 1000000),
  terms_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(terms_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint kinto_deals_v1_valid_period check (ends_at > starts_at),
  constraint kinto_deals_v1_kind_threshold check (
    (kind = 'limited_purchase' and threshold_units is null)
    or (kind in ('choose_n','buy_n') and threshold_units is not null)
  ),
  constraint kinto_deals_v1_gift_rules check (
    gift_product_id is null or kind in ('choose_n','buy_n')
  )
);
create index if not exists kinto_deals_v1_campaigns_store_status_idx
  on public.kinto_deals_v1_campaigns(store_id,status,starts_at,ends_at);

create table if not exists public.kinto_deals_v1_products (
  campaign_id uuid not null references public.kinto_deals_v1_campaigns(id) on delete cascade,
  product_id uuid not null references public.local_products(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (campaign_id, product_id)
);

-- Admin review inbox is NOT an outbound customer/vendor notification.
create table if not exists public.kinto_deals_v1_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.kinto_deals_v1_campaigns(id) on delete restrict,
  store_id uuid not null references public.local_stores(id) on delete restrict,
  title_snapshot text not null,
  summary_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary_snapshot) = 'object'),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_state text not null default 'pending'
    check (review_state in ('pending','acknowledged','rejected')),
  unique (campaign_id, submitted_at)
);
create index if not exists kinto_deals_v1_submissions_review_idx
  on public.kinto_deals_v1_submissions(review_state,submitted_at desc);

-- Reserved ledger only: no write API, checkout hook, gift allocation or redemption
-- is installed by G1. Never count a browser-supplied customer_id as identity.
create table if not exists public.kinto_deals_v1_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.kinto_deals_v1_campaigns(id) on delete restrict,
  store_id uuid not null references public.local_stores(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  state text not null check (state in ('pending','confirmed','released','reversed')),
  qualifying_units integer not null check (qualifying_units >= 1),
  gift_product_id uuid references public.local_products(id) on delete restrict,
  frozen_snapshot jsonb not null check (jsonb_typeof(frozen_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id,order_id)
);
create index if not exists kinto_deals_v1_redemptions_customer_idx
  on public.kinto_deals_v1_redemptions(campaign_id,customer_id,state);

-- Own-table integrity: do not allow a gift or eligible product from another store.
-- These triggers touch only new DEALS tables; no existing order/product triggers change.
create or replace function public.kinto_deals_v1_validate_campaign()
returns trigger language plpgsql
set search_path = public, pg_temp as $
begin
  if new.gift_product_id is not null and not exists (
    select 1 from public.local_products p
    where p.id = new.gift_product_id and p.store_id = new.store_id
  ) then
    raise exception 'DEALS_GIFT_MUST_BELONG_TO_STORE' using errcode='23514';
  end if;
  return new;
end;
$;
create trigger trg_kinto_deals_v1_validate_campaign
before insert or update of store_id,gift_product_id
on public.kinto_deals_v1_campaigns for each row
execute function public.kinto_deals_v1_validate_campaign();

create or replace function public.kinto_deals_v1_validate_product()
returns trigger language plpgsql
set search_path = public, pg_temp as $
begin
  if not exists (
    select 1 from public.kinto_deals_v1_campaigns c
    join public.local_products p on p.id = new.product_id
    where c.id = new.campaign_id and p.store_id = c.store_id
  ) then
    raise exception 'DEALS_PRODUCT_MUST_BELONG_TO_CAMPAIGN_STORE' using errcode='23514';
  end if;
  return new;
end;
$;
create trigger trg_kinto_deals_v1_validate_product
before insert or update of campaign_id,product_id
on public.kinto_deals_v1_products for each row
execute function public.kinto_deals_v1_validate_product();

-- A campaign's owning store is immutable after creation. Otherwise previously
-- attached products, gifts, submissions and redemptions could silently change owner.
create or replace function public.kinto_deals_v1_immutable_store()
returns trigger language plpgsql
set search_path = public, pg_temp as $
begin
  if new.store_id is distinct from old.store_id then
    raise exception 'DEALS_STORE_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end;
$;
create trigger trg_kinto_deals_v1_immutable_store
before update of store_id on public.kinto_deals_v1_campaigns
for each row execute function public.kinto_deals_v1_immutable_store();
revoke all on function public.kinto_deals_v1_validate_campaign(),
 public.kinto_deals_v1_validate_product(), public.kinto_deals_v1_immutable_store()
 from public, anon, authenticated;

-- All new objects are closed to anon/authenticated; verified SECURITY DEFINER
-- session-bound endpoints will be reviewed in a separate migration.
alter table public.kinto_deals_v1_flags enable row level security;
alter table public.kinto_deals_v1_campaigns enable row level security;
alter table public.kinto_deals_v1_products enable row level security;
alter table public.kinto_deals_v1_submissions enable row level security;
alter table public.kinto_deals_v1_redemptions enable row level security;
revoke all on public.kinto_deals_v1_flags,
 public.kinto_deals_v1_campaigns, public.kinto_deals_v1_products,
 public.kinto_deals_v1_submissions, public.kinto_deals_v1_redemptions
 from public, anon, authenticated;
-- No permissive RLS policies and no client EXECUTE grants in G1.
commit;
