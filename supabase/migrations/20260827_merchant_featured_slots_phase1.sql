-- MeshWar Featured Merchants / Sponsorships — Phase 1
-- Scope: database + admin CMS only. No INDEX/frontend rendering in this phase.

create extension if not exists pgcrypto;

create table if not exists public.merchant_featured_slots (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references auth.users(id) on delete cascade,
    slot_type varchar(30) not null check (slot_type in ('hero_banner', 'featured_grid', 'sponsored_product')),
    banner_url text,
    store_logo text,
    store_name varchar(150) not null,
    item_ids uuid[] default '{}',
    start_date timestamptz not null default now(),
    end_date timestamptz not null,
    is_active boolean default true,
    created_at timestamptz default now()
);

create index if not exists merchant_featured_slots_active_window_idx
    on public.merchant_featured_slots (is_active, start_date, end_date);
create index if not exists merchant_featured_slots_merchant_idx
    on public.merchant_featured_slots (merchant_id);

create or replace view public.active_merchant_slots_view as
select *
from public.merchant_featured_slots
where is_active = true
  and now() between start_date and end_date;

-- Keep direct table writes closed to the public client. Admin CMS uses the guarded RPCs below.
alter table public.merchant_featured_slots enable row level security;
revoke all on table public.merchant_featured_slots from anon, authenticated;
grant select on public.active_merchant_slots_view to anon, authenticated;

create or replace function public.meshwar_is_admin(p_admin_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.id = p_admin_id
      and lower(coalesce(e.role,'')) in ('admin','أدمن','ادمن')
      and coalesce(e.is_active,true) = true
  );
$$;

revoke all on function public.meshwar_is_admin(uuid) from public;
grant execute on function public.meshwar_is_admin(uuid) to anon, authenticated;

create or replace function public.list_featured_merchants(p_admin_id uuid)
returns table(id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  return query
    select u.id, coalesce(u.email::text,'')
    from auth.users u
    order by u.created_at desc;
end;
$$;

revoke all on function public.list_featured_merchants(uuid) from public;
grant execute on function public.list_featured_merchants(uuid) to anon, authenticated;

create or replace function public.admin_list_merchant_featured_slots(p_admin_id uuid)
returns setof public.merchant_featured_slots
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  return query
    select * from public.merchant_featured_slots
    order by created_at desc;
end;
$$;

revoke all on function public.admin_list_merchant_featured_slots(uuid) from public;
grant execute on function public.admin_list_merchant_featured_slots(uuid) to anon, authenticated;

create or replace function public.admin_upsert_merchant_featured_slot(
  p_admin_id uuid,
  p_id uuid,
  p_merchant_id uuid,
  p_slot_type varchar,
  p_banner_url text,
  p_store_logo text,
  p_store_name varchar,
  p_item_ids uuid[],
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'end_date must be after start_date';
  end if;
  if p_slot_type not in ('hero_banner','featured_grid','sponsored_product') then
    raise exception 'invalid slot_type';
  end if;

  if p_id is null then
    insert into public.merchant_featured_slots(
      merchant_id,slot_type,banner_url,store_logo,store_name,item_ids,start_date,end_date,is_active
    ) values (
      p_merchant_id,p_slot_type,nullif(trim(p_banner_url),''),nullif(trim(p_store_logo),''),trim(p_store_name),
      coalesce(p_item_ids,'{}'::uuid[]),p_start_date,p_end_date,coalesce(p_is_active,true)
    ) returning id into v_id;
  else
    update public.merchant_featured_slots set
      merchant_id=p_merchant_id,
      slot_type=p_slot_type,
      banner_url=nullif(trim(p_banner_url),''),
      store_logo=nullif(trim(p_store_logo),''),
      store_name=trim(p_store_name),
      item_ids=coalesce(p_item_ids,'{}'::uuid[]),
      start_date=p_start_date,
      end_date=p_end_date,
      is_active=coalesce(p_is_active,true)
    where id=p_id
    returning id into v_id;
    if v_id is null then raise exception 'campaign not found'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_merchant_featured_slot(uuid,uuid,uuid,varchar,text,text,varchar,uuid[],timestamptz,timestamptz,boolean) from public;
grant execute on function public.admin_upsert_merchant_featured_slot(uuid,uuid,uuid,varchar,text,text,varchar,uuid[],timestamptz,timestamptz,boolean) to anon, authenticated;

create or replace function public.admin_toggle_merchant_featured_slot(
  p_admin_id uuid,
  p_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  update public.merchant_featured_slots
  set is_active = p_is_active
  where id = p_id;
  if not found then raise exception 'campaign not found'; end if;
  return true;
end;
$$;

revoke all on function public.admin_toggle_merchant_featured_slot(uuid,uuid,boolean) from public;
grant execute on function public.admin_toggle_merchant_featured_slot(uuid,uuid,boolean) to anon, authenticated;
