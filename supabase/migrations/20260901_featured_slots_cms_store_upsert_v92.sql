-- KINTO V92 — Featured campaign CMS store identity repair only.
-- Scope is intentionally limited to merchant_featured_slots and its guarded admin RPC.

begin;

create or replace function public.admin_upsert_merchant_featured_slot_v2(
  p_admin_id uuid,
  p_id uuid,
  p_store_id uuid,
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
set search_path=public
as $$
declare
  v_id uuid;
begin
  if p_admin_id is null or not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;
  if p_store_id is null then raise exception 'store_id is required'; end if;
  if not exists (
    select 1 from public.local_stores s
    where s.id=p_store_id and coalesce(s.is_active,true)=true
  ) then
    raise exception 'store not found or inactive';
  end if;
  if p_end_date<=p_start_date then raise exception 'end_date must be after start_date'; end if;
  if p_slot_type not in ('hero_banner','featured_grid','sponsored_product') then
    raise exception 'invalid slot_type';
  end if;
  if p_slot_type='sponsored_product' and coalesce(array_length(p_item_ids,1),0)=0 then
    raise exception 'sponsored_product requires at least one item_id';
  end if;

  if p_id is null then
    insert into public.merchant_featured_slots(
      store_id,merchant_id,slot_type,banner_url,store_logo,store_name,item_ids,start_date,end_date,is_active
    ) values (
      p_store_id,null,p_slot_type,nullif(trim(p_banner_url),''),nullif(trim(p_store_logo),''),
      trim(p_store_name),coalesce(p_item_ids,'{}'::uuid[]),p_start_date,p_end_date,coalesce(p_is_active,true)
    ) returning id into v_id;
  else
    update public.merchant_featured_slots set
      store_id=p_store_id,
      merchant_id=null,
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

revoke all on function public.admin_upsert_merchant_featured_slot_v2(uuid,uuid,uuid,varchar,text,text,varchar,uuid[],timestamptz,timestamptz,boolean) from public;
grant execute on function public.admin_upsert_merchant_featured_slot_v2(uuid,uuid,uuid,varchar,text,text,varchar,uuid[],timestamptz,timestamptz,boolean) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
