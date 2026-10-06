-- G21D: expose valid option combinations, not independent dimensions.
-- Fixes stale/invalid color-size-volume cross-combinations in merchant campaign composer.
begin;

create or replace function private.kinto_deals_v1_combo_available_g21d(
 p_store_id uuid,p_product_id uuid,p_color text,p_size text,p_volume text)
returns boolean language plpgsql stable security definer
set search_path=public,private,pg_temp as $g21d$
begin
 perform private.kinto_deals_v1_assert_product_available_g21b(
  p_store_id,p_product_id,
  jsonb_build_object('color',coalesce(p_color,''),'size',coalesce(p_size,''),'volume',coalesce(p_volume,'')),1);
 return true;
exception when others then return false;
end;
$g21d$;
revoke all on function private.kinto_deals_v1_combo_available_g21d(uuid,uuid,text,text,text) from public,anon,authenticated;

create or replace function public.kinto_deals_v1_vendor_product_options_g20(
 p_session_token text,p_product_ids uuid[])
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_product_ids is null or cardinality(p_product_ids) not between 1 and 50 then raise exception 'DEALS_PRODUCT_LIST_REQUIRED' using errcode='22023'; end if;
 if (select count(*) from public.local_products p where p.store_id=v_store and p.id=any(p_product_ids))<>cardinality(p_product_ids)
 then raise exception 'DEALS_PRODUCT_OWNERSHIP_REQUIRED' using errcode='23514'; end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,
  'options',jsonb_build_object(
   'colors',coalesce(p.options->'colors','[]'::jsonb),
   'sizes',coalesce(p.options->'sizes','[]'::jsonb),
   'volumes',coalesce(p.options->'volumes','[]'::jsonb)),
  'available_combinations',coalesce((
   select jsonb_agg(jsonb_build_object('color',c.v,'size',s.v,'volume',vol.v))
   from jsonb_array_elements_text(case when jsonb_array_length(coalesce(p.options->'colors','[]'::jsonb))>0 then p.options->'colors' else '[""]'::jsonb end) c(v)
   cross join jsonb_array_elements_text(case when jsonb_array_length(coalesce(p.options->'sizes','[]'::jsonb))>0 then p.options->'sizes' else '[""]'::jsonb end) s(v)
   cross join jsonb_array_elements_text(case when jsonb_array_length(coalesce(p.options->'volumes','[]'::jsonb))>0 then p.options->'volumes' else '[""]'::jsonb end) vol(v)
   where private.kinto_deals_v1_combo_available_g21d(v_store,p.id,c.v,s.v,vol.v)
  ),'[]'::jsonb)
 ) order by p.id),'[]'::jsonb)
 into v_rows
 from public.local_products p
 where p.store_id=v_store and p.id=any(p_product_ids);

 return v_rows;
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_product_options_g20(text,uuid[]) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_product_options_g20(text,uuid[]) to anon,authenticated;

notify pgrst,'reload schema';
commit;
