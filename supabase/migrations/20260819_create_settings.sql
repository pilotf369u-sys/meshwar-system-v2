-- CMS settings compatibility table used by admin-dashboard.html and admin-content-cms.html.
-- The current application authenticates admins in public.employees and writes from the browser
-- with the Supabase publishable key, so this migration preserves the existing client-side model.

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.settings is 'MeshWar application and CMS key/value settings';
comment on column public.settings.value is 'JSONB value; scalar JSON values remain compatible with legacy string/number settings';

-- Compatibility grants for the existing frontend Supabase client.
grant select, insert, update on table public.settings to anon, authenticated;

-- RLS remains disabled until Supabase Auth/RLS replaces the current custom employee session model.
alter table public.settings disable row level security;
