-- MeshWar Featured Campaigns — Store Identity Repair
-- Canonical merchant identity is local_stores.id; auth.users merchant_id remains compatibility-only.

begin;

alter table public.merchant_featured_slots
  add column if not exists store_id uuid;

alter table public.merchant_featured_slots
  alter column merchant_id drop not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='merchant_featured_slots_store_id_fkey'
      and conrelid='public.merchant_featured_slots'::regclass
  ) then
    alter table public.merchant_featured_slots
      add constraint merchant_featured_slots_store_id_fkey
      foreign key (store_id) references public.local_stores(id) on delete cascade;
  end if;
end $$;

create index if not exists merchant_featured_slots_store_idx
  on public.merchant_featured_slots(store_id, created_at desc);

-- Return real local stores to Admin CMS. Keep column name `email` for backwards UI compatibility.
drop function if exists public.list_featured_merchants(uuid);
create function public.list_featured_merchants(p_admin_id uuid)
returns table(id uuid,email text)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  return query
  select s.id,
         coalesce(nullif(trim(s.store_name),''), s.id::text)::text as email
  from public.local_stores s
  where coalesce(s.is_active,true)=true
  order by coalesce(nullif(trim(s.store_name),''), s.id::text);
end;
$$;
revoke all on function public.list_featured_merchants(uuid) from public;
grant execute on function public.list_featured_merchants(uuid) to anon, authenticated;

-- Canonical approval contract used by admin-featured-requests-v2.js.
-- Admin Dashboard uses its own application session, so p_admin_id is explicitly
-- supplied and verified server-side through meshwar_is_admin(p_admin_id).
drop function if exists public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text);
drop function if exists public.admin_approve_featured_request(uuid,uuid,timestamptz,timestamptz,text);
create function public.admin_approve_featured_request(
  p_admin_id uuid,
  p_request_id uuid,
  p_store_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.merchant_featured_requests%rowtype;
  v_slot uuid;
begin
  if p_admin_id is null or not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  if p_end_date<=p_start_date then raise exception 'end_date must be after start_date'; end if;

  select * into r
  from public.merchant_featured_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'request not found'; end if;
  if r.status<>'pending' then raise exception 'request already reviewed'; end if;
  if p_store_id is null then raise exception 'store_id is required'; end if;
  if r.store_id is not null and p_store_id<>r.store_id then
    raise exception 'selected store does not match request store';
  end if;
  if not exists(select 1 from public.local_stores s where s.id=p_store_id and coalesce(s.is_active,true)=true) then
    raise exception 'store not found or inactive';
  end if;

  insert into public.merchant_featured_slots(
    store_id,merchant_id,slot_type,banner_url,store_logo,store_name,item_ids,start_date,end_date,is_active
  ) values (
    p_store_id,null,r.slot_type,r.banner_url,r.store_logo,r.store_name,r.item_ids,p_start_date,p_end_date,true
  ) returning id into v_slot;

  update public.merchant_featured_requests
  set store_id=p_store_id,status='approved',approved_slot_id=v_slot,reviewed_by=p_admin_id,reviewed_at=now(),
      admin_note=nullif(trim(p_admin_note),''),updated_at=now()
  where id=p_request_id;

  return v_slot;
end;
$$;
revoke all on function public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text) from public;
grant execute on function public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text) to anon, authenticated;

-- Active view includes store identity automatically through SELECT *.
create or replace view public.active_merchant_slots_view as
select * from public.merchant_featured_slots
where is_active=true and now() between start_date and end_date;

notify pgrst, 'reload schema';
commit;
