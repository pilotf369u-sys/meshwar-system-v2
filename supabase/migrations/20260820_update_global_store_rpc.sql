-- MeshWar: secure edit RPC for global stores.
create or replace function public.update_global_store(
  p_admin_id text,
  p_store_id bigint,
  p_name text,
  p_logo_url text,
  p_category text,
  p_store_url text,
  p_sort_order integer default 0
)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
begin
  if not exists (
    select 1 from public.employees e
    where e.id::text=btrim(p_admin_id)
      and lower(btrim(coalesce(e.role::text,''))) in ('admin','أدمن','ادمن')
      and coalesce(e.is_active,true)=true
  ) then
    raise exception 'Not authorized to manage global stores';
  end if;

  if p_store_id is null then raise exception 'Store id is required'; end if;
  if btrim(coalesce(p_name,''))='' or btrim(coalesce(p_store_url,''))='' then
    raise exception 'Store name and URL are required';
  end if;
  if coalesce(p_category,'') not in ('comprehensive','fashion','sports','beauty','home') then
    raise exception 'Invalid store category';
  end if;

  update public.global_stores
  set name=btrim(p_name),
      logo_url=btrim(coalesce(p_logo_url,'')),
      category=p_category,
      store_url=btrim(p_store_url),
      sort_order=coalesce(p_sort_order,0),
      is_active=true,
      updated_at=now()
  where id=p_store_id
  returning id into v_id;

  if v_id is null then raise exception 'Global store not found'; end if;
  return v_id;
end;
$$;

revoke all on function public.update_global_store(text,bigint,text,text,text,text,integer) from public;
grant execute on function public.update_global_store(text,bigint,text,text,text,text,integer) to anon, authenticated;
notify pgrst, 'reload schema';
