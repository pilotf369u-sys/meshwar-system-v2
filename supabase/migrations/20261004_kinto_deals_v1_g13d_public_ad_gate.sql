-- G13D: reuse the deployed G10 public feed, rather than duplicating publication rules.
begin;
create or replace function public.kinto_deals_v1_public_ad_path_g13(p_campaign_id uuid)
returns text language plpgsql stable security definer
set search_path=public,private,pg_temp as $fn$
declare v_store_id uuid;v_path text;
begin
 select c.store_id,a.object_path into v_store_id,v_path
 from public.kinto_deals_v1_campaigns c
 join public.kinto_deals_v1_ad_assets_g13 a on a.campaign_id=c.id
 where c.id=p_campaign_id;
 if v_path is null then return null;end if;
 if exists (
  select 1 from jsonb_array_elements(to_jsonb(public.kinto_deals_v1_public_feed_g7(v_store_id))) as f(item)
  where f.item->>'campaign_id'=p_campaign_id::text
 ) then return v_path;end if;
 return null;
end;$fn$;
revoke all on function public.kinto_deals_v1_public_ad_path_g13(uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_public_ad_path_g13(uuid) to service_role;
commit;
