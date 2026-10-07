-- V428: serialize attachment insert against deletion, deny late uploads.
create or replace function private.notice_asset_insert_guard_v428()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare pending timestamptz;
begin
 select media_delete_pending_at into pending
 from public.kinto_customer_admin_notices where id=new.notice_id for update;
 if not found or pending is not null then raise exception 'NOTICE_UNAVAILABLE_FOR_MEDIA'; end if;
 return new;
end $$;
drop trigger if exists kinto_notice_asset_insert_guard_v428 on public.kinto_customer_notice_assets_v418;
create trigger kinto_notice_asset_insert_guard_v428
 before insert on public.kinto_customer_notice_assets_v418
 for each row execute function private.notice_asset_insert_guard_v428();
revoke all on function private.notice_asset_insert_guard_v428() from public,anon,authenticated;
