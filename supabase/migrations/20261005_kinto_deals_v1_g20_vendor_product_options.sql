-- G20: verified vendor option projection for campaign composition.
begin;
create or replace function public.kinto_deals_v1_vendor_product_options_g20(
 p_session_token text,p_product_ids uuid[])
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_product_ids is null or cardinality(p_product_ids) not between 1 and 50 then
  raise exception 'DEALS_PRODUCT_LIST_REQUIRED' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'options',jsonb_build_object(
    'colors',coalesce(p.options->'colors','[]'::jsonb),
    'sizes',coalesce(p.options->'sizes','[]'::jsonb),
    'volumes',coalesce(p.options->'volumes','[]'::jsonb))) order by p.id),'[]'::jsonb)
 into v_rows
 from public.local_products p
 where p.store_id=v_store and p.id=any(p_product_ids);
 if jsonb_array_length(v_rows)<>cardinality(p_product_ids) then
  raise exception 'DEALS_PRODUCT_OWNERSHIP_REQUIRED' using errcode='23514'; end if;
 return v_rows;
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_product_options_g20(text,uuid[]) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_product_options_g20(text,uuid[]) to anon,authenticated;
commit;
