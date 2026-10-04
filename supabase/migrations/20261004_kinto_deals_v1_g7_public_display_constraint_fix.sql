-- G7 customer DISPLAY ONLY. Independent of merchant_deals_enabled (checkout remains OFF).
-- Manual migration; all existing campaigns start unpublished and public display OFF.
begin;
create table if not exists public.kinto_deals_v1_publications_g7 (
 campaign_id uuid primary key references public.kinto_deals_v1_campaigns(id) on delete cascade,
 published boolean not null default false,
 published_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint kinto_deals_g7_publication_consistency check (not published or published_at is not null)
);
alter table public.kinto_deals_v1_publications_g7 enable row level security;
revoke all on public.kinto_deals_v1_publications_g7 from public,anon,authenticated;
create table if not exists public.kinto_deals_v1_display_settings_g7 (
 setting_key text primary key check (setting_key='public_display'),
 enabled boolean not null default false
);
alter table public.kinto_deals_v1_display_settings_g7 enable row level security;
revoke all on public.kinto_deals_v1_display_settings_g7 from public,anon,authenticated;
insert into public.kinto_deals_v1_display_settings_g7(setting_key,enabled)
values ('public_display',false) on conflict (setting_key) do nothing;
create or replace function public.kinto_deals_v1_public_feed_g7(p_store_id uuid default null)
returns table(campaign_id uuid,store_id uuid,title text,description text,kind text,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path=public,private,pg_temp
as $feed$
 select c.id,c.store_id,c.title,c.description,c.kind,c.starts_at,c.ends_at
 from public.kinto_deals_v1_campaigns c
 join public.kinto_deals_v1_publications_g7 pub on pub.campaign_id=c.id
 join public.local_stores st on st.id=c.store_id
 join lateral (
   select s.id,s.review_state from public.kinto_deals_v1_submissions s
   where s.campaign_id=c.id order by s.submitted_at desc,s.id desc limit 1
 ) latest on true
 where coalesce((select f.enabled from public.kinto_deals_v1_display_settings_g7 f
                 where f.setting_key='public_display'),false)
   and pub.published=true and pub.published_at is not null
   and c.status='submitted' and st.status='active'
   and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()
   and latest.review_state='acknowledged'
   and exists(select 1 from public.kinto_deals_v1_review_events e
     where e.submission_id=latest.id and e.campaign_id=c.id and e.store_id=c.store_id
       and e.decision='approved')
   and (p_store_id is null or c.store_id=p_store_id)
 order by c.ends_at asc,c.id asc limit 200
$feed$;
revoke all on function public.kinto_deals_v1_public_feed_g7(uuid) from public;
grant execute on function public.kinto_deals_v1_public_feed_g7(uuid) to anon,authenticated;
commit;
-- Publication changes are intentionally NOT exposed to browser roles.
-- A later separately reviewed admin workflow may publish individual approved campaigns.
