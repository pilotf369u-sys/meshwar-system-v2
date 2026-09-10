-- KINTO V131: additive-only product review storage.
-- This migration does not alter orders, tracking, employees, invoices, or existing functions.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on update cascade on delete restrict,
  order_id uuid not null references public.orders(id) on update cascade on delete restrict,
  order_store_segment_id uuid references public.order_store_segments(id) on update cascade on delete set null,
  store_id uuid not null references public.local_stores(id) on update cascade on delete restrict,
  product_id uuid references public.local_products(id) on update cascade on delete set null,
  product_reference text not null,
  product_name_snapshot text not null,
  product_image_snapshot text,
  rating smallint not null,
  comment text,
  verified_purchase boolean not null default true,
  moderation_status text not null default 'pending',
  moderation_note text,
  moderated_at timestamptz,
  moderated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_rating_range check (rating between 1 and 5),
  constraint product_reviews_reference_required check (char_length(trim(product_reference)) between 1 and 200),
  constraint product_reviews_name_required check (char_length(trim(product_name_snapshot)) between 1 and 300),
  constraint product_reviews_comment_length check (comment is null or char_length(comment) between 1 and 2000),
  constraint product_reviews_status_allowed check (moderation_status in ('pending','published','rejected','hidden')),
  constraint product_reviews_one_per_order_product unique (customer_id, order_id, product_reference)
);

create index if not exists idx_product_reviews_product_published
  on public.product_reviews(product_id, created_at desc)
  where moderation_status = 'published';
create index if not exists idx_product_reviews_store_published
  on public.product_reviews(store_id, created_at desc)
  where moderation_status = 'published';
create index if not exists idx_product_reviews_customer_created
  on public.product_reviews(customer_id, created_at desc);
create index if not exists idx_product_reviews_moderation_queue
  on public.product_reviews(moderation_status, created_at asc);
create index if not exists idx_product_reviews_order
  on public.product_reviews(order_id);

create table if not exists public.product_review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on update cascade on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null,
  width integer,
  height integer,
  sort_order smallint not null default 0,
  moderation_status text not null default 'pending',
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid,
  constraint product_review_images_mime_allowed check (mime_type in ('image/jpeg','image/png','image/webp')),
  constraint product_review_images_size_allowed check (byte_size > 0 and byte_size <= 5242880),
  constraint product_review_images_dimensions_allowed check (
    (width is null or width between 1 and 6000)
    and (height is null or height between 1 and 6000)
  ),
  constraint product_review_images_sort_range check (sort_order between 0 and 4),
  constraint product_review_images_status_allowed check (moderation_status in ('pending','published','rejected','hidden')),
  constraint product_review_images_review_order unique (review_id, sort_order)
);

create index if not exists idx_product_review_images_review
  on public.product_review_images(review_id, sort_order);

create table if not exists public.customer_review_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on update cascade on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_review_sessions_expiry_valid check (expires_at > created_at)
);

create index if not exists idx_customer_review_sessions_customer
  on public.customer_review_sessions(customer_id, expires_at desc)
  where revoked_at is null;

alter table public.product_reviews enable row level security;
alter table public.product_review_images enable row level security;
alter table public.customer_review_sessions enable row level security;

revoke all on public.product_reviews from public, anon, authenticated;
revoke all on public.product_review_images from public, anon, authenticated;
revoke all on public.customer_review_sessions from public, anon, authenticated;

commit;
