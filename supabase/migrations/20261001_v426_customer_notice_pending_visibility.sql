-- V426: immediately hide notices once a privileged delete begins.
-- V420 continues enriching V414 items with linked store logos unchanged.
create or replace function public.customer_admin_notices_v414(
 p_session_token text,p_page integer default 1,p_page_size integer default 8
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare cid text; pg int; sz int;
begin
 cid:=private.require_customer_review_session(p_session_token)::text;
 if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 pg:=greatest(1,least(coalesce(p_page,1),100000));
 sz:=greatest(1,least(coalesce(p_page_size,8),20));
 return jsonb_build_object(
 'unread',(select count(*) from public.kinto_customer_admin_notice_recipients r
 join public.kinto_customer_admin_notices n on n.id=r.notice_id
 where r.customer_id=cid and r.read_at is null and n.media_delete_pending_at is null),
 'total',(select count(*) from public.kinto_customer_admin_notice_recipients r
 join public.kinto_customer_admin_notices n on n.id=r.notice_id
 where r.customer_id=cid and n.media_delete_pending_at is null),
 'page',pg,'page_size',sz,
 'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc)
 from (select n.id,n.title,n.body,n.kind,n.created_at,r.read_at
 from public.kinto_customer_admin_notice_recipients r
 join public.kinto_customer_admin_notices n on n.id=r.notice_id
 where r.customer_id=cid and n.media_delete_pending_at is null
 order by n.created_at desc,n.id desc
 limit sz offset (pg-1)*sz) x),'[]'::jsonb));
end $$;
create or replace function public.customer_read_admin_notice_v414(
 p_session_token text,p_notice_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare cid text;
begin
 cid:=private.require_customer_review_session(p_session_token)::text;
 if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 update public.kinto_customer_admin_notice_recipients r
 set read_at=coalesce(r.read_at,now())
 where r.notice_id=p_notice_id and r.customer_id=cid
 and exists(select 1 from public.kinto_customer_admin_notices n
 where n.id=r.notice_id and n.media_delete_pending_at is null);
 if not found then raise exception 'notice not found'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.customer_admin_notices_v414(text,integer,integer) from public,anon,authenticated;
revoke all on function public.customer_read_admin_notice_v414(text,uuid) from public,anon,authenticated;
grant execute on function public.customer_admin_notices_v414(text,integer,integer) to anon,authenticated;
grant execute on function public.customer_read_admin_notice_v414(text,uuid) to anon,authenticated;
