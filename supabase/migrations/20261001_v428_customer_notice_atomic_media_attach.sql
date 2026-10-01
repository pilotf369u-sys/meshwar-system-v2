-- V428: serialize media attachment against notice deletion.
-- Service-role-only: the Edge endpoint authenticates the live admin first.
begin;
create or replace function public.attach_customer_notice_media_v428(
 p_notice_id uuid,p_admin_id text,p_object_path text,p_mime_type text,p_byte_size integer
) returns boolean language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare owner_id text;
begin
 if p_notice_id is null or coalesce(p_admin_id,'')='' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_notice_id::text,425));
 select created_by into owner_id from public.kinto_customer_admin_notices
 where id=p_notice_id and media_delete_pending_at is null for update;
 if not found or owner_id is distinct from p_admin_id then return false; end if;
 if exists(select 1 from public.kinto_customer_notice_assets_v418 where notice_id=p_notice_id) then return false; end if;
 insert into public.kinto_customer_notice_assets_v418(notice_id,bucket_id,object_path,mime_type,byte_size)
 values(p_notice_id,'kinto-customer-notice-media',p_object_path,p_mime_type,p_byte_size);
 return true;
end $$;
revoke all on function public.attach_customer_notice_media_v428(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.attach_customer_notice_media_v428(uuid,text,text,text,integer) to service_role;
commit;
