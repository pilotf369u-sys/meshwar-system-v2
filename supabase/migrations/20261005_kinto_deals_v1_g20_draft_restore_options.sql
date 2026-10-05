-- G20: read-only verified projection of frozen options for draft restoration.
begin;
create or replace function public.kinto_deals_v1_vendor_draft_options_g20(
 p_session_token text,p_campaign_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_result jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if not exists(select 1 from public.kinto_deals_v1_campaigns c where c.id=p_campaign_id and c.store_id=v_store) then
  raise exception 'DEALS_CAMPAIGN_NOT_FOUND' using errcode='P0002'; end if;
 select coalesce(jsonb_object_agg(cp.product_id::text,cp.selected_options),'{}'::jsonb)
 into v_result from public.kinto_deals_v1_products cp where cp.campaign_id=p_campaign_id;
 return v_result;
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_draft_options_g20(text,uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_draft_options_g20(text,uuid) to anon,authenticated;
commit;
