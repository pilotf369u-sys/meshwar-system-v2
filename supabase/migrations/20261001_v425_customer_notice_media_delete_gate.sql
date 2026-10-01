-- V425: secure notice media lifecycle gate; apply only after V418.
-- Storage deletion is performed by a privileged Edge Function, never SQL-only.
begin;
alter table public.kinto_customer_admin_notices
 add column if not exists media_delete_pending_at timestamptz;
create index if not exists kinto_notice_media_delete_pending_idx
 on public.kinto_customer_admin_notices(media_delete_pending_at)
 where media_delete_pending_at is not null;
-- Admin must be revalidated on every destructive request. This does not delete Storage.
create or replace function public.admin_prepare_customer_notice_delete_v425(
 p_session_token text,p_notice_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text; path text; found_notice boolean;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' or p_notice_id is null then raise exception 'invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_notice_id::text,425));
 select true into found_notice from public.kinto_customer_admin_notices
 where id=p_notice_id for update;
 if not coalesce(found_notice,false) then
  return jsonb_build_object('ok',true,'already_deleted',true);
 end if;
 update public.kinto_customer_admin_notices
 set media_delete_pending_at=coalesce(media_delete_pending_at,now())
 where id=p_notice_id;
 select object_path into path from public.kinto_customer_notice_assets_v418
 where notice_id=p_notice_id;
 return jsonb_build_object('ok',true,'pending',true,'has_asset',path is not null);
end $$;
revoke all on function public.admin_prepare_customer_notice_delete_v425(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_prepare_customer_notice_delete_v425(text,uuid) to anon,authenticated;
-- Service-role-only finalization; caller must verify Storage object was removed or absent.
create or replace function private.finalize_customer_notice_delete_v425(p_notice_id uuid)
returns boolean language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
begin
 if p_notice_id is null then raise exception 'notice id required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_notice_id::text,425));
 if not exists(select 1 from public.kinto_customer_admin_notices
  where id=p_notice_id and media_delete_pending_at is not null for update)
 then return false; end if;
 delete from public.kinto_customer_notice_assets_v418 where notice_id=p_notice_id;
 delete from public.kinto_customer_admin_notices where id=p_notice_id;
 return true;
end $$;
revoke all on function private.finalize_customer_notice_delete_v425(uuid) from public,anon,authenticated;
grant execute on function private.finalize_customer_notice_delete_v425(uuid) to service_role;
commit;
