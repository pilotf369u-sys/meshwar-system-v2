-- G20: save merchant-frozen options for each paid campaign product.
-- Additive wrapper; order lifecycle and stock lifecycle are untouched.
begin;
create or replace function public.kinto_deals_v1_vendor_set_product_options_g20(
 p_session_token text,p_campaign_id uuid,p_product_options jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_count integer;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if jsonb_typeof(p_product_options) is distinct from 'object' then
  raise exception 'DEALS_PRODUCT_OPTIONS_OBJECT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.kinto_deals_v1_campaigns c
  where c.id=p_campaign_id and c.store_id=v_store and c.status='draft'
   and not exists(select 1 from public.kinto_deals_v1_submissions s where s.campaign_id=c.id)) then
  raise exception 'DEALS_DRAFT_NOT_EDITABLE' using errcode='40001'; end if;
 if exists(
  select 1 from jsonb_each(p_product_options) e
  where jsonb_typeof(e.value)<>'object'
   or length(e.value::text)>3000
   or not exists(select 1 from public.kinto_deals_v1_products cp
      where cp.campaign_id=p_campaign_id and cp.product_id::text=e.key)
 ) then raise exception 'DEALS_INVALID_PRODUCT_OPTIONS' using errcode='22023'; end if;
 update public.kinto_deals_v1_products cp
 set selected_options=coalesce(p_product_options->cp.product_id::text,'{}'::jsonb)
 where cp.campaign_id=p_campaign_id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'product_count',v_count);
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_set_product_options_g20(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_set_product_options_g20(text,uuid,jsonb) to anon,authenticated;

create or replace function public.kinto_deals_v1_vendor_save_draft_g20(
 p_session_token text,p_campaign_id uuid,p_expected_updated_at timestamptz,p_draft jsonb,p_product_options jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $g20save$
declare v_result jsonb; v_id uuid;
begin
 v_result:=public.kinto_deals_v1_vendor_save_draft_g4(p_session_token,p_campaign_id,p_expected_updated_at,p_draft);
 v_id:=(v_result->>'campaign_id')::uuid;
 perform public.kinto_deals_v1_vendor_set_product_options_g20(p_session_token,v_id,coalesce(p_product_options,'{}'::jsonb));
 return v_result;
end;$g20save$;
revoke all on function public.kinto_deals_v1_vendor_save_draft_g20(text,uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_save_draft_g20(text,uuid,timestamptz,jsonb,jsonb) to anon,authenticated;
commit;
