-- MeshWar Hero CMS V13 — ticket-gated Supabase Storage uploads.
-- The project uses a custom admin session, so upload authorization is validated
-- through meshwar_is_admin(p_admin_id) rather than auth.uid().

begin;

create table if not exists public.hero_upload_tokens (
  token uuid primary key,
  admin_id uuid not null,
  object_name text not null unique,
  mime_type text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.hero_upload_tokens is
  'Short-lived upload tickets for CMS Hero media. Direct browser table access is disabled.';

alter table public.hero_upload_tokens enable row level security;
revoke all on table public.hero_upload_tokens from public, anon, authenticated;

create index if not exists hero_upload_tokens_expires_idx
  on public.hero_upload_tokens(expires_at);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'site-hero-media',
  'site-hero-media',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.meshwar_can_upload_hero_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hero_upload_tokens t
    where t.object_name = p_name
      and t.expires_at > now()
  );
$$;

revoke all on function public.meshwar_can_upload_hero_object(text) from public;
grant execute on function public.meshwar_can_upload_hero_object(text) to anon, authenticated;

create or replace function public.admin_create_hero_upload(
  p_admin_id uuid,
  p_file_name text,
  p_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_mime text := lower(trim(coalesce(p_mime_type, '')));
  v_ext text;
  v_object_name text;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if p_admin_id is null or not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;

  v_ext := case v_mime
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/gif' then 'gif'
    when 'video/mp4' then 'mp4'
    when 'video/webm' then 'webm'
    when 'video/quicktime' then 'mov'
    else null
  end;

  if v_ext is null then
    raise exception 'unsupported hero media mime type: %', v_mime;
  end if;

  -- Keep only live tickets; uploaded objects themselves remain immutable because
  -- CMS uses unique names with upsert=false and no UPDATE storage policy exists.
  delete from public.hero_upload_tokens where expires_at <= now();

  v_object_name := 'hero/' || v_token::text || '.' || v_ext;

  insert into public.hero_upload_tokens(token, admin_id, object_name, mime_type, expires_at)
  values (v_token, p_admin_id, v_object_name, v_mime, v_expires_at);

  return jsonb_build_object(
    'bucket', 'site-hero-media',
    'path', v_object_name,
    'mime_type', v_mime,
    'expires_at', v_expires_at,
    'max_bytes', 104857600,
    'original_name', left(coalesce(p_file_name, ''), 255)
  );
end;
$$;

revoke all on function public.admin_create_hero_upload(uuid,text,text) from public;
grant execute on function public.admin_create_hero_upload(uuid,text,text) to anon, authenticated;

drop policy if exists "meshwar hero ticket upload" on storage.objects;
create policy "meshwar hero ticket upload"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'site-hero-media'
  and public.meshwar_can_upload_hero_object(name)
);

-- Public delivery is intentional for homepage media. Bucket public=true supplies
-- the public object URL; no client UPDATE/DELETE policy is granted here.

select pg_notify('pgrst', 'reload schema');

commit;
