-- MeshWar CMS live fix: robust public read path for site_settings.
-- Safe to run after 20260819_create_settings.sql.

grant usage on schema public to anon, authenticated;
grant select on table public.settings to anon, authenticated;

drop policy if exists settings_public_site_settings_read on public.settings;
drop policy if exists "Allow public read for site_settings" on public.settings;

create policy "Allow public read for site_settings"
on public.settings
for select
to anon, authenticated
using (key = 'site_settings');

create or replace function public.get_site_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select s.value
  from public.settings s
  where s.key = 'site_settings'
  limit 1;
$$;

revoke all on function public.get_site_settings() from public;
grant execute on function public.get_site_settings() to anon, authenticated;
