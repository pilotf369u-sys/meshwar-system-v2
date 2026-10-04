-- G9: protected read-only status for G8 controls; no direct table grants.
begin;
create or replace function public.kinto_deals_v1_admin_publication_status_g9(
 p_session_token text,p_campaign_id uuid default null)
returns jsonb language plpgsql stable security definer
set search_path=public,private,pg_temp as $g9$
declare v_admin text;v_display boolean;v_published boolean;v_at timestamptz;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'DEALS_ADMIN_SESSION_REQUIRED' using errcode='28000';end if;
 select enabled into v_display from public.kinto_deals_v1_display_settings_g7 where setting_key='public_display';
 if p_campaign_id is not null then
  if not exists(select 1 from public.kinto_deals_v1_campaigns where id=p_campaign_id) then
   raise exception 'DEALS_CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
  select published,published_at into v_published,v_at
   from public.kinto_deals_v1_publications_g7 where campaign_id=p_campaign_id;
 end if;
 return jsonb_build_object('display_enabled',coalesce(v_display,false),
  'published',coalesce(v_published,false),'published_at',v_at,'campaign_id',p_campaign_id);
end;$g9$;
revoke all on function public.kinto_deals_v1_admin_publication_status_g9(text,uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_admin_publication_status_g9(text,uuid) to anon,authenticated;
commit;
