-- V421: return existing live store logo in the customer-scoped notice feed.
-- No new storage, uploads, order or campaign mutations.
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
 select jsonb_agg(jsonb_build_object(
  'id',s.store_id,'name',s.store_name,
  'logo_url',case when ls.logo_url ~* '^https://[^[:space:]<>"]+$'
   then ls.logo_url else null end
 ) order by s.store_name)
 from public.kinto_customer_notice_stores_v420 s
 left join public.local_stores ls on ls.id::text=s.store_id
 where s.notice_id=(item->>'id')::uuid
 ),'[]'::jsonb)) order by ord)
 from jsonb_array_elements(result->'items') with ordinality as x(item,ord)
 ),'[]'::jsonb));
end $$;
revoke all on function public.customer_admin_notices_v420(text,integer,integer) from public,anon,authenticated;
grant execute on function public.customer_admin_notices_v420(text,integer,integer) to anon,authenticated;
