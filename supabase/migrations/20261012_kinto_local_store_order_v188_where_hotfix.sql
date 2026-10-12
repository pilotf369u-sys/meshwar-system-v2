-- V188 hotfix: replace move function only; no table or store data changes.
begin;
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
 else w.position end where w.position between least(v_source,v_target) and greatest(v_source,v_target);
 insert into public.kinto_local_store_display_order_v188(store_id,sort_order)
 select store_id,position from pg_temp.kinto_order_work_v188
 on conflict(store_id) do update set sort_order=excluded.sort_order;
 return v_target;
end $$;
commit;
