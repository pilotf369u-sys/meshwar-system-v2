-- G13A: isolated private storage and metadata. Apply only after full G13 review.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kinto-merchant-campaign-ads','kinto-merchant-campaign-ads',false,204800,array['image/webp']) on conflict(id) do nothing;
create table if not exists public.kinto_deals_v1_ad_assets_g13(
 campaign_id uuid primary key references public.kinto_deals_v1_campaigns(id) on delete cascade,
 object_path text not null unique,
 mime_type text not null default 'image/webp' check(mime_type='image/webp'),
 byte_size integer not null check(byte_size between 32 and 204800),
 width integer not null check(width between 1 and 1200),
 height integer not null check(height between 1 and 1200),
 attached_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.kinto_deals_v1_ad_cleanup_g13(
 object_path text primary key,
 campaign_id uuid not null,
 queued_at timestamptz not null default now(),
 attempts integer not null default 0,
 last_error text,
 cleaned_at timestamptz
);
alter table public.kinto_deals_v1_ad_assets_g13 enable row level security;
alter table public.kinto_deals_v1_ad_cleanup_g13 enable row level security;
revoke all on public.kinto_deals_v1_ad_assets_g13 from public,anon,authenticated;
revoke all on public.kinto_deals_v1_ad_cleanup_g13 from public,anon,authenticated;
commit;
