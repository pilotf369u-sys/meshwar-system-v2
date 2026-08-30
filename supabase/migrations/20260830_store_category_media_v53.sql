-- MESHWAR CATEGORY IMAGE V53 — isolated media table + public bucket.
-- Does not alter store_categories, customer auth, orders, or session tables.
create table if not exists public.store_category_media (
  category_id uuid primary key references public.store_categories(id) on delete cascade,
  store_id uuid not null references public.local_stores(id) on delete cascade,
  image_url text,
  storage_path text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_store_category_media_store_id
  on public.store_category_media(store_id);

alter table public.store_category_media enable row level security;

drop policy if exists "category media public read" on public.store_category_media;
create policy "category media public read"
  on public.store_category_media for select
  using (true);

-- Compatibility with the project's existing custom vendor-session model.
-- Restrict further server-side when/if vendor writes move to Supabase Auth/RPC.
drop policy if exists "category media public insert" on public.store_category_media;
create policy "category media public insert"
  on public.store_category_media for insert
  with check (true);

drop policy if exists "category media public update" on public.store_category_media;
create policy "category media public update"
  on public.store_category_media for update
  using (true) with check (true);

drop policy if exists "category media public delete" on public.store_category_media;
create policy "category media public delete"
  on public.store_category_media for delete
  using (true);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('category-images','category-images',true,3145728,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public=true,
  file_size_limit=3145728,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "category images public read" on storage.objects;
create policy "category images public read"
  on storage.objects for select
  using (bucket_id='category-images');

drop policy if exists "category images public insert" on storage.objects;
create policy "category images public insert"
  on storage.objects for insert
  with check (bucket_id='category-images');

drop policy if exists "category images public update" on storage.objects;
create policy "category images public update"
  on storage.objects for update
  using (bucket_id='category-images') with check (bucket_id='category-images');

drop policy if exists "category images public delete" on storage.objects;
create policy "category images public delete"
  on storage.objects for delete
  using (bucket_id='category-images');
