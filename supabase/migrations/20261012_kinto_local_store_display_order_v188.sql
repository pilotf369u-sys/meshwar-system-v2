-- KINTO V188: isolated public display order. Run before testing V188 UI.
begin;
create table if not exists public.kinto_local_store_display_order_v188 (
 store_id uuid primary key references public.local_stores(id) on delete cascade,
 sort_order bigint not null,
 created_at timestamptz not null default now()
);
create index if not exists kinto_local_store_display_order_v188_sort_idx on public.kinto_local_store_display_order_v188(sort_order,store_id);
alter table public.kinto_local_store_display_order_v188 enable row level security;
revoke all on public.kinto_local_store_display_order_v188 from public,anon,authenticated;
-- Initial order: older stores first; new stores are appended dynamically.
insert into public.kinto_local_store_display_order_v188(store_id,sort_order)
select id,row_number() over(order by created_at asc,id asc)
from public.local_stores on conflict(store_id) do nothing;
create or replace function public.kinto_list_local_store_order_v188()
returns table(store_id uuid, display_position bigint)
language sql security definer set search_path=public,pg_temp
as $$
 select s.id,row_number() over(order by
   case when o.store_id is null then 1 else 0 end,
   o.sort_order asc nulls last,s.created_at asc,s.id asc)
 from public.local_stores s left join public.kinto_local_store_display_order_v188 o on o.store_id=s.id
$$;
revoke all on function public.kinto_list_local_store_order_v188() from public;
grant execute on function public.kinto_list_local_store_order_v188() to anon,authenticated;
create or replace function public.kinto_move_local_store_v188(
 p_session_token text,p_store_id uuid,p_target_position integer
) returns integer
language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_admin text;v_count integer;v_source integer;v_target integer;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if not exists(select 1 from public.employees e where e.id::text=v_admin
  and lower(btrim(e.role)) in ('admin','أدمن','ادمن') and coalesce(e.is_active,true))
 then raise exception 'ADMIN_NOT_AUTHORIZED';end if;
 perform pg_advisory_xact_lock(1881012);
 if p_store_id is null or p_target_position is null then raise exception 'INVALID_POSITION';end if;
 if not exists(select 1 from public.local_stores where id=p_store_id) then raise exception 'STORE_NOT_FOUND';end if;
 select count(*) into v_count from public.local_stores;
 v_target:=greatest(1,least(p_target_position,v_count));
 create temporary table if not exists pg_temp.kinto_order_work_v188(
  store_id uuid primary key,position integer not null) on commit drop;
 truncate pg_temp.kinto_order_work_v188;
 insert into pg_temp.kinto_order_work_v188(store_id,position)
 select x.store_id,x.display_position::integer from public.kinto_list_local_store_order_v188() x;
 select w.position into v_source from pg_temp.kinto_order_work_v188 w where w.store_id=p_store_id;
 if v_source=v_target then return v_target;end if;
 update pg_temp.kinto_order_work_v188 w set position=case
 when w.store_id=p_store_id then v_target
 when v_target<v_source and w.position>=v_target and w.position<v_source then w.position+1
 when v_target>v_source and w.position>v_source and w.position<=v_target then w.position-1
 else w.position end;
 insert into public.kinto_local_store_display_order_v188(store_id,sort_order)
 select store_id,position from pg_temp.kinto_order_work_v188
 on conflict(store_id) do update set sort_order=excluded.sort_order;
 return v_target;
end $$;
revoke all on function public.kinto_move_local_store_v188(text,uuid,integer) from public;
grant execute on function public.kinto_move_local_store_v188(text,uuid,integer) to anon,authenticated;
commit;
