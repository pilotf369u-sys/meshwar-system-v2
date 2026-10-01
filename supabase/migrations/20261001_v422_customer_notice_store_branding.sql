-- V422: expose a frozen store display name and logo only for recipient-authorized notices.
-- No public access to stores or recipient tables is added.
create or replace function public.customer_admin_notices_v422(
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
  'id',link.store_id,'name',coalesce(nullif(btrim(store.store_name),''),nullif(btrim(link.store_name),''),'متجر'),
  'logo_url',case when store.logo_url ~* '^https://[^[:space:]"<>]+$' then store.logo_url else null end
 ) order by link.store_name,link.store_id)
 from public.kinto_customer_notice_stores_v420 link
 left join public.local_stores store on store.id::text=link.store_id
 where link.notice_id=(item->>'id')::uuid
 ),'[]'::jsonb)) order by ord)
 from jsonb_array_elements(result->'items') with ordinality as x(item,ord)
 ),'[]'::jsonb));
end $$;
revoke all on function public.customer_admin_notices_v422(text,integer,integer) from public,anon,authenticated;
grant execute on function public.customer_admin_notices_v422(text,integer,integer) to anon,authenticated;
