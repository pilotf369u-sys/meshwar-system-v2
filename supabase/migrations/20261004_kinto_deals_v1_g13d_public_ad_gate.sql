-- G13D: exact-campaign public image gate, with the same approval/publication conditions as G10.
begin;
create or replace function public.kinto_deals_v1_public_ad_path_g13(p_campaign_id uuid)
returns text language sql stable security definer set search_path=public,private,pg_temp
as $fn$
 select a.object_path
 from public.kinto_deals_v1_ad_assets_g13 a
 join public.kinto_deals_v1_campaigns c on c.id=a.campaign_id
 join public.kinto_deals_v1_publications_g7 pub on pub.campaign_id=c.id
 join public.local_stores st on st.id=c.store_id
 join lateral (
  select s.id,s.review_state from public.kinto_deals_v1_submissions s
  where s.campaign_id=c.id order by s.submitted_at desc,s.id desc limit 1
 ) latest on true
 where a.campaign_id=p_campaign_id and pub.published=true and pub.published_at is not null
  and c.status='submitted' and st.status='active'
  and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()
  and latest.review_state='acknowledged'
  and exists(select 1 from public.kinto_deals_v1_review_events e
   where e.submission_id=latest.id and e.campaign_id=c.id and e.store_id=c.store_id and e.decision='approved')
 limit 1
$fn$;
revoke all on function public.kinto_deals_v1_public_ad_path_g13(uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_public_ad_path_g13(uuid) to service_role;
commit;
