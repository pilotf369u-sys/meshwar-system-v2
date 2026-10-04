-- G8: admin-only publication controls. Does NOT activate merchant_deals_enabled.
begin;
create or replace function public.kinto_deals_v1_admin_publication_g8(
 p_session_token text,p_campaign_id uuid,p_action text)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g8$
declare v_admin text;v_campaign public.kinto_deals_v1_campaigns%rowtype;
v_latest public.kinto_deals_v1_submissions%rowtype;v_now timestamptz:=statement_timestamp();
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'DEALS_ADMIN_SESSION_REQUIRED' using errcode='28000';end if;
 if p_action not in ('publish','unpublish','enable_display','disable_display') or p_action is null then
  raise exception 'DEALS_PUBLICATION_ACTION_INVALID' using errcode='22023';end if;
 if p_action in ('enable_display','disable_display') then
  update public.kinto_deals_v1_display_settings_g7
    set enabled=(p_action='enable_display') where setting_key='public_display';
  if not found then raise exception 'DEALS_DISPLAY_SETTINGS_MISSING' using errcode='P0002';end if;
  return jsonb_build_object('ok',true,'action',p_action,'display_enabled',p_action='enable_display');
 end if;
 if p_campaign_id is null then raise exception 'DEALS_CAMPAIGN_REQUIRED' using errcode='22023';end if;
 select * into v_campaign from public.kinto_deals_v1_campaigns where id=p_campaign_id for update;
 if not found then raise exception 'DEALS_CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
 if p_action='publish' then
  select * into v_latest from public.kinto_deals_v1_submissions
   where campaign_id=p_campaign_id order by submitted_at desc,id desc limit 1;
  if not found or v_latest.store_id<>v_campaign.store_id
    or v_latest.review_state<>'acknowledged'
    or not exists(select 1 from public.kinto_deals_v1_review_events e
      where e.submission_id=v_latest.id and e.campaign_id=v_campaign.id
        and e.store_id=v_campaign.store_id and e.decision='approved')
    or v_campaign.status<>'submitted'
    or v_campaign.starts_at>v_now or v_campaign.ends_at<=v_now
    or not exists(select 1 from public.local_stores st
       where st.id=v_campaign.store_id and st.status='active') then
    raise exception 'DEALS_CAMPAIGN_NOT_PUBLISHABLE' using errcode='P0001';end if;
  insert into public.kinto_deals_v1_publications_g7(campaign_id,published,published_at,updated_at)
   values(p_campaign_id,true,v_now,v_now)
   on conflict(campaign_id) do update set published=true,published_at=coalesce(
      case when public.kinto_deals_v1_publications_g7.published
       then public.kinto_deals_v1_publications_g7.published_at end,excluded.published_at),
      updated_at=excluded.updated_at;
 else
  insert into public.kinto_deals_v1_publications_g7(campaign_id,published,published_at,updated_at)
   values(p_campaign_id,false,null,v_now)
   on conflict(campaign_id) do update set published=false,updated_at=excluded.updated_at;
 end if;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'action',p_action);
end;$g8$;
revoke all on function public.kinto_deals_v1_admin_publication_g8(text,uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_admin_publication_g8(text,uuid,text) to anon,authenticated;
commit;
