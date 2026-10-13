-- KINTO: admin-managed local store types. Apply before merging UI.
begin;
create table if not exists public.kinto_local_store_types_v1 (
 name text primary key,
 sort_order integer not null default 100,
 created_at timestamptz not null default now(),
 constraint valid_store_type_name check (char_length(btrim(name)) between 2 and 80 and name=btrim(name))
);
alter table public.kinto_local_store_types_v1 enable row level security;
revoke all on public.kinto_local_store_types_v1 from public, anon, authenticated;
insert into public.kinto_local_store_types_v1(name,sort_order)
select name, ord from unnest(array['شامل','نسائي','رجالي','أطفال','منزلية','أعمال يدوية','أثاث','إلكترونيات','مطاعم','غذائية','حيوانات','عدد إنشاءات','صيانة','قطع غيار','سيارات']) with ordinality as t(name,ord)
on conflict(name) do nothing;
insert into public.kinto_local_store_types_v1(name,sort_order)
select distinct btrim(store_type), 100 from public.local_stores
where nullif(btrim(store_type),'') is not null
on conflict(name) do nothing;
create or replace function public.kinto_list_local_store_types_v1()
returns table(name text, sort_order integer)
language sql security definer set search_path=public,pg_temp
as $$select t.name,t.sort_order from public.kinto_local_store_types_v1 t order by t.sort_order,t.name$$;
revoke all on function public.kinto_list_local_store_types_v1() from public;
grant execute on function public.kinto_list_local_store_types_v1() to anon,authenticated;
create or replace function public.kinto_add_local_store_type_v1(p_session_token text,p_name text)
returns text language plpgsql security definer set search_path=public,private,extensions,pg_temp
as $$
declare v_admin text; v_name text:=btrim(coalesce(p_name,'')); v_existing text;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if not exists(select 1 from public.employees e where e.id::text=v_admin and lower(btrim(e.role)) in ('admin','أدمن','ادمن') and coalesce(e.is_active,true)) then
   raise exception 'ADMIN_NOT_AUTHORIZED';
 end if;
 if char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]<>]' then raise exception 'INVALID_CATEGORY_NAME'; end if;
 select t.name into v_existing from public.kinto_local_store_types_v1 t where lower(t.name)=lower(v_name) limit 1;
 if v_existing is not null then return v_existing; end if;
 insert into public.kinto_local_store_types_v1(name,sort_order) values(v_name,100);
 return v_name;
end $$;
revoke all on function public.kinto_add_local_store_type_v1(text,text) from public;
grant execute on function public.kinto_add_local_store_type_v1(text,text) to anon,authenticated;
commit;