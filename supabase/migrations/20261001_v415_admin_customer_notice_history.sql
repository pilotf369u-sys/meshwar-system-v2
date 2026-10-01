-- Admin-only history, isolated from customer/order notifications.
create or replace function public.admin_customer_notices_v415(
 p_session_token text,p_page integer default 1,p_page_size integer default 8
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text; pg int; sz int;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 pg:=greatest(1,least(coalesce(p_page,1),100000));
 sz:=greatest(1,least(coalesce(p_page_size,8),20));
 return jsonb_build_object(
 'total',(select count(*) from public.kinto_customer_admin_notices),
 'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc)
 from (select n.id,n.title,n.body,n.kind,n.created_at,
 (select count(*) from public.kinto_customer_admin_notice_recipients r where r.notice_id=n.id) recipients,
 (select count(*) from public.kinto_customer_admin_notice_recipients r where r.notice_id=n.id and r.read_at is not null) read_count
 from public.kinto_customer_admin_notices n order by n.created_at desc,n.id desc
 limit sz offset (pg-1)*sz) x),'[]'::jsonb));
end $$;
revoke all on function public.admin_customer_notices_v415(text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_customer_notices_v415(text,integer,integer) to anon,authenticated;
