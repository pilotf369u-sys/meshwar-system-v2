-- V414: server-authoritative access to V413. No direct table access.
create or replace function public.admin_send_customer_notice_v414(
 p_session_token text,p_request_key uuid,p_title text,p_body text,
 p_kind text default 'announcement',p_customer_ids text[] default null,p_all_customers boolean default false
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text; nid uuid; cnt int; k text;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 if p_request_key is null then raise exception 'request key required'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 2 and 160 then raise exception 'invalid title'; end if;
 if char_length(btrim(coalesce(p_body,''))) not between 2 and 4000 then raise exception 'invalid body'; end if;
 k:=lower(btrim(coalesce(p_kind,'')));
 if k not in ('announcement','campaign','discount','warning','policy') then raise exception 'invalid kind'; end if;
 if not coalesce(p_all_customers,false) and
 (coalesce(cardinality(p_customer_ids),0)=0 or cardinality(p_customer_ids)>500) then
 raise exception 'select 1 to 500 customers'; end if;
 insert into public.kinto_customer_admin_notices(request_key,title,body,kind,created_by)
 values(p_request_key,btrim(p_title),btrim(p_body),k,aid)
 on conflict(request_key) do nothing returning id into nid;
 if nid is null then
 select id into nid from public.kinto_customer_admin_notices
 where request_key=p_request_key and created_by=aid;
 if nid is null then raise exception 'request key already used'; end if;
 return jsonb_build_object('ok',true,'notice_id',nid,'duplicate',true,
 'recipients',(select count(*) from public.kinto_customer_admin_notice_recipients where notice_id=nid));
 end if;
 insert into public.kinto_customer_admin_notice_recipients(notice_id,customer_id)
 select nid,c.id::text from public.customers c
 where coalesce(p_all_customers,false) or c.id::text=any(p_customer_ids)
 on conflict do nothing;
 get diagnostics cnt=row_count;
 if cnt=0 then raise exception 'no valid recipients'; end if;
 return jsonb_build_object('ok',true,'notice_id',nid,'recipients',cnt,'duplicate',false);
end $$;
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
 'unread',(select count(*) from public.kinto_customer_admin_notice_recipients r where r.customer_id=cid and r.read_at is null),
 'total',(select count(*) from public.kinto_customer_admin_notice_recipients r where r.customer_id=cid),
 'page',pg,'page_size',sz,
 'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc)
 from (select n.id,n.title,n.body,n.kind,n.created_at,r.read_at
 from public.kinto_customer_admin_notice_recipients r
 join public.kinto_customer_admin_notices n on n.id=r.notice_id
 where r.customer_id=cid order by n.created_at desc,n.id desc
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
 update public.kinto_customer_admin_notice_recipients
 set read_at=coalesce(read_at,now())
 where notice_id=p_notice_id and customer_id=cid;
 if not found then raise exception 'notice not found'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.admin_send_customer_notice_v414(text,uuid,text,text,text,text[],boolean) from public,anon,authenticated;
revoke all on function public.customer_admin_notices_v414(text,integer,integer) from public,anon,authenticated;
revoke all on function public.customer_read_admin_notice_v414(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_send_customer_notice_v414(text,uuid,text,text,text,text[],boolean) to anon,authenticated;
grant execute on function public.customer_admin_notices_v414(text,integer,integer) to anon,authenticated;
grant execute on function public.customer_read_admin_notice_v414(text,uuid) to anon,authenticated;
