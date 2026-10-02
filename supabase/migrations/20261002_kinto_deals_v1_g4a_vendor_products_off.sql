-- G4A: verified vendor product picker, read-only. Does not create/submit campaigns.
-- Feature flag remains OFF. No browser table grants or legacy changes.
begin;
create or replace function public.kinto_deals_v1_vendor_products_g4(
 p_session_token text,p_search text default '',p_limit integer default 30)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid; v_query text; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_limit is null or p_limit not between 1 and 50 then
  raise exception 'DEALS_INVALID_PRODUCT_LIMIT' using errcode='22023';
 end if;
 v_query:=left(btrim(coalesce(p_search,'')),70);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.product_name,q.id),'[]'::jsonb)
 into v_rows from (
  select p.id,p.product_name,p.image_url,p.barcode,p.currency,
   p.base_price,p.discount_price,p.is_out_of_stock,p.stock_quantity
  from public.local_products p
  where p.store_id=v_store
   and (v_query='' or p.product_name ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
    or p.barcode ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
  order by p.product_name,p.id limit p_limit
 ) q;
 return jsonb_build_object('store_id',v_store,'items',v_rows,'read_only',true);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_products_g4(text,text,integer)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_products_g4(text,text,integer)
 to anon,authenticated;
commit;
