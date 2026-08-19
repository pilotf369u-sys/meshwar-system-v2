-- MeshWar CMS settings storage + secure write RPC.
-- Public homepage may read only the site_settings row.
-- Browser clients cannot insert/update settings directly; writes go through save_site_settings().

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.settings is 'MeshWar application/CMS key-value settings';
comment on column public.settings.value is 'JSONB payload for one setting key';

alter table public.settings enable row level security;

revoke all on table public.settings from anon, authenticated;
grant select on table public.settings to anon, authenticated;

drop policy if exists settings_public_site_settings_read on public.settings;
create policy settings_public_site_settings_read
on public.settings
for select
to anon, authenticated
using (key = 'site_settings');

create or replace function public.save_site_settings(
  p_admin_id text,
  p_value jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_id is null or btrim(p_admin_id) = '' then
    raise exception 'adminId is required';
  end if;

  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'site_settings payload must be a JSON object';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id::text = btrim(p_admin_id)
      and lower(btrim(coalesce(e.role::text, ''))) in ('admin', 'أدمن', 'ادمن')
      and coalesce(e.is_active, true) = true
  ) then
    raise exception 'Not authorized to manage site settings';
  end if;

  insert into public.settings (key, value, updated_at)
  values ('site_settings', p_value, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.save_site_settings(text, jsonb) from public;
grant execute on function public.save_site_settings(text, jsonb) to anon, authenticated;
