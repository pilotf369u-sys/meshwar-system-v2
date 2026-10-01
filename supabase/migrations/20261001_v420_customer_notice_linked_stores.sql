-- V420: optional, immutable store references on customer admin notices.
-- This is presentation metadata only, never financial campaign participation.
create table if not exists public.kinto_customer_notice_stores_v420(
 notice_id uuid not null references public.kinto_customer_admin_notices(id) on delete cascade,
 store_id text not null,
 store_name text not null check(length(btrim(store_name)) between 1 and 180),
 primary key(notice_id,store_id)
);
create index if not exists kinto_customer_notice_stores_v420_notice_idx
 on public.kinto_customer_notice_stores_v420(notice_id);
alter table public.kinto_customer_notice_stores_v420 enable row level security;
revoke all on public.kinto_customer_notice_stores_v420 from public,anon,authenticated;

-- The whole send + optional store linkage runs in one database transaction.
create or replace function public.admin_send_customer_notice_v420(
 p_session_token text,p_request_key uuid,p_title text,p_body text,
 p_kind text default 'announcement',p_customer_ids text[] default null,
 p_all_customers boolean default false,p_store_ids text[] default null
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text; result jsonb; nid uuid; wanted int; inserted int;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 wanted:=coalesce(cardinality(p_store_ids),0);
 if wanted>20 then raise exception 'maximum 20 linked stores'; end if;
 if wanted>0 and (exists(select 1 from unnest(p_store_ids) x where x is null or btrim(x)='') or
   (select count(distinct x) from unnest(p_store_ids) x)<>wanted)
 then raise exception 'invalid or duplicate store ids'; end if;
 result:=public.admin_send_customer_notice_v414(
 p_session_token,p_request_key,p_title,p_body,p_kind,p_customer_ids,p_all_customers);
 nid:=(result->>'notice_id')::uuid;
 if coalesce((result->>'duplicate')::boolean,false) then
  -- An idempotent retry must not change the original linked-store selection.
  return result;
 end if;
 if wanted>0 then
  insert into public.kinto_customer_notice_stores_v420(notice_id,store_id,store_name)
  select nid,s.id::text,coalesce(nullif(btrim(to_jsonb(s)->>'name'),''),'متجر')
  from public.local_stores s where s.id::text=any(p_store_ids);
  get diagnostics inserted=row_count;
  if inserted<>wanted then raise exception 'one or more linked stores not found'; end if;
 end if;
 return result||jsonb_build_object('linked_stores',wanted);
end $$;

create or replace function public.customer_admin_notices_v420(
 p_session_token text,p_page integer default 1,p_page_size integer default 8
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare result jsonb; cid text;
begin
 cid:=private.require_customer_review_session(p_session_token)::text;
 if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 result:=public.customer_admin_notices_v414(p_session_token,p_page,p_page_size);
 return jsonb_set(result,'{items}',coalesce((
 select jsonb_agg(item || jsonb_build_object('stores',coalesce((
 select jsonb_agg(jsonb_build_object('id',s.store_id,'name',s.store_name) order by s.store_name)
 from public.kinto_customer_notice_stores_v420 s
 where s.notice_id=(item->>'id')::uuid
 ),'[]'::jsonb)) order by ord)
 from jsonb_array_elements(result->'items') with ordinality as x(item,ord)
 ),'[]'::jsonb));
end $$;
revoke all on function public.admin_send_customer_notice_v420(text,uuid,text,text,text,text[],boolean,text[]) from public,anon,authenticated;
revoke all on function public.customer_admin_notices_v420(text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_send_customer_notice_v420(text,uuid,text,text,text,text[],boolean,text[]) to anon,authenticated;
grant execute on function public.customer_admin_notices_v420(text,integer,integer) to anon,authenticated;
