-- MeshWar Featured Merchants / Sponsorships — Phase 2
-- Merchant request workflow only. INDEX remains untouched.

create table if not exists public.merchant_featured_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.local_stores(id) on delete cascade,
  slot_type varchar(30) not null check (slot_type in ('hero_banner','featured_grid','sponsored_product')),
  banner_url text,
  store_logo text,
  store_name varchar(150) not null,
  item_ids uuid[] not null default '{}',
  requested_start_date timestamptz,
  requested_end_date timestamptz,
  status varchar(20) not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  approved_slot_id uuid references public.merchant_featured_slots(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_featured_requests_store_idx on public.merchant_featured_requests(store_id,created_at desc);
create index if not exists merchant_featured_requests_status_idx on public.merchant_featured_requests(status,created_at desc);

alter table public.merchant_featured_requests enable row level security;
revoke all on table public.merchant_featured_requests from anon, authenticated;

create or replace function public.vendor_submit_featured_request(
  p_store_id uuid,
  p_slot_type varchar,
  p_banner_url text,
  p_store_logo text,
  p_store_name varchar,
  p_item_ids uuid[],
  p_requested_start_date timestamptz default null,
  p_requested_end_date timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.local_stores s where s.id=p_store_id and coalesce(s.is_active,true)=true) then
    raise exception 'store not found or inactive';
  end if;
  if p_slot_type not in ('hero_banner','featured_grid','sponsored_product') then raise exception 'invalid slot_type'; end if;
  if nullif(trim(coalesce(p_store_name,'')),'') is null then raise exception 'store_name required'; end if;
  if p_requested_start_date is not null and p_requested_end_date is not null and p_requested_end_date<=p_requested_start_date then raise exception 'requested end must be after start'; end if;
  insert into public.merchant_featured_requests(store_id,slot_type,banner_url,store_logo,store_name,item_ids,requested_start_date,requested_end_date,status)
  values(p_store_id,p_slot_type,nullif(trim(p_banner_url),''),nullif(trim(p_store_logo),''),trim(p_store_name),coalesce(p_item_ids,'{}'::uuid[]),p_requested_start_date,p_requested_end_date,'pending')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.vendor_submit_featured_request(uuid,varchar,text,text,varchar,uuid[],timestamptz,timestamptz) from public;
grant execute on function public.vendor_submit_featured_request(uuid,varchar,text,text,varchar,uuid[],timestamptz,timestamptz) to anon, authenticated;

create or replace function public.vendor_list_featured_requests(p_store_id uuid)
returns setof public.merchant_featured_requests
language sql
security definer
set search_path=public
as $$ select * from public.merchant_featured_requests where store_id=p_store_id order by created_at desc $$;
revoke all on function public.vendor_list_featured_requests(uuid) from public;
grant execute on function public.vendor_list_featured_requests(uuid) to anon, authenticated;

create or replace function public.admin_list_featured_requests(p_admin_id uuid)
returns setof public.merchant_featured_requests
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.meshwar_is_admin(p_admin_id) then raise exception 'not authorized'; end if;
  return query select * from public.merchant_featured_requests order by case status when 'pending' then 0 else 1 end,created_at desc;
end;
$$;
revoke all on function public.admin_list_featured_requests(uuid) from public;
grant execute on function public.admin_list_featured_requests(uuid) to anon, authenticated;

create or replace function public.admin_approve_featured_request(
  p_admin_id uuid,
  p_request_id uuid,
  p_merchant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare r public.merchant_featured_requests%rowtype; v_slot uuid;
begin
  if not public.meshwar_is_admin(p_admin_id) then raise exception 'not authorized'; end if;
  if p_end_date<=p_start_date then raise exception 'end_date must be after start_date'; end if;
  select * into r from public.merchant_featured_requests where id=p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if r.status<>'pending' then raise exception 'request already reviewed'; end if;
  insert into public.merchant_featured_slots(merchant_id,slot_type,banner_url,store_logo,store_name,item_ids,start_date,end_date,is_active)
  values(p_merchant_id,r.slot_type,r.banner_url,r.store_logo,r.store_name,r.item_ids,p_start_date,p_end_date,true)
  returning id into v_slot;
  update public.merchant_featured_requests set status='approved',approved_slot_id=v_slot,reviewed_by=p_admin_id,reviewed_at=now(),admin_note=nullif(trim(p_admin_note),''),updated_at=now() where id=p_request_id;
  return v_slot;
end;
$$;
revoke all on function public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text) from public;
grant execute on function public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text) to anon, authenticated;

create or replace function public.admin_reject_featured_request(p_admin_id uuid,p_request_id uuid,p_admin_note text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.meshwar_is_admin(p_admin_id) then raise exception 'not authorized'; end if;
  update public.merchant_featured_requests set status='rejected',reviewed_by=p_admin_id,reviewed_at=now(),admin_note=nullif(trim(p_admin_note),''),updated_at=now() where id=p_request_id and status='pending';
  if not found then raise exception 'pending request not found'; end if;
  return true;
end;
$$;
revoke all on function public.admin_reject_featured_request(uuid,uuid,text) from public;
grant execute on function public.admin_reject_featured_request(uuid,uuid,text) to anon, authenticated;

notify pgrst, 'reload schema';
