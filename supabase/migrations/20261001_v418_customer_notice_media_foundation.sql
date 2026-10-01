-- V418: attachment lifecycle foundation. No public upload or delete is enabled here.
-- A notice owns at most one object. Recipients only reference the notice.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kinto-customer-notice-media','kinto-customer-notice-media',false,5242880,
 array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=5242880,
 allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.kinto_customer_notice_assets_v418(
 notice_id uuid primary key references public.kinto_customer_admin_notices(id) on delete restrict,
 bucket_id text not null default 'kinto-customer-notice-media'
  check(bucket_id='kinto-customer-notice-media'),
 object_path text not null unique
  check(object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp|gif)$'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 created_at timestamptz not null default now()
);
alter table public.kinto_customer_notice_assets_v418 enable row level security;
revoke all on public.kinto_customer_notice_assets_v418 from public,anon,authenticated;

-- Prevent the legacy V417 function from removing an asset-backed notice.
-- FK RESTRICT protects against accidental orphaning until the privileged
-- media cleanup endpoint deletes Storage and then removes this asset record.
-- No anon/authenticated storage INSERT/UPDATE/DELETE policy is granted.
