-- V417: secure, idempotent deletion of a customer notice and all recipient/read rows.
-- Attachment-backed notices are deliberately refused until Storage cleanup is verified.
create or replace function public.admin_delete_customer_notice_v417(
 p_session_token text,p_notice_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text; deleted_count integer;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 if p_notice_id is null then raise exception 'notice id required'; end if;
 -- Do not delete a record with an attached file before verified Storage cleanup exists.
 if exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='kinto_customer_admin_notices'
    and column_name='attachment_path'
 ) then
  -- Schema-specific attachment cleanup must be performed by a privileged Storage API.
  -- This migration intentionally supports only notices without attachments.
  if exists (
   select 1 from public.kinto_customer_admin_notices n
   where n.id=p_notice_id and to_jsonb(n)->>'attachment_path' is not null
  ) then raise exception 'attachment cleanup required before notice deletion'; end if;
 end if;
 delete from public.kinto_customer_admin_notices where id=p_notice_id;
 get diagnostics deleted_count=row_count;
 return jsonb_build_object('ok',true,'deleted',deleted_count>0);
end $$;
revoke all on function public.admin_delete_customer_notice_v417(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_delete_customer_notice_v417(text,uuid) to anon,authenticated;
