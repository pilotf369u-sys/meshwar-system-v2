-- V421: canonical local_stores column is store_name, not name.
-- Refresh display snapshots only; no changes to recipients, orders, campaigns or balances.
update public.kinto_customer_notice_stores_v420 n
set store_name=left(btrim(s.store_name),180)
from public.local_stores s
where s.id::text=n.store_id and nullif(btrim(s.store_name),'') is not null
 and n.store_name is distinct from left(btrim(s.store_name),180);

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
  select nid,s.id::text,coalesce(nullif(btrim(to_jsonb(s)->>'store_name'),''),'متجر')
  from public.local_stores s where s.id::text=any(p_store_ids);
  get diagnostics inserted=row_count;
  if inserted<>wanted then raise exception 'one or more linked stores not found'; end if;
 end if;
 return result||jsonb_build_object('linked_stores',wanted);
end $$;

