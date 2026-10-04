-- G7: READ ONLY inspection before exposing merchant deals on customer storefront.
-- No writes, no feature activation, no changes to coupons, stock or checkout.
select 'feature_flag' as check_name, coalesce((select enabled::text from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),'missing') as result;
select c.status, s.review_state, count(*) as campaign_count
from public.kinto_deals_v1_campaigns c
left join lateral (
 select x.review_state from public.kinto_deals_v1_submissions x
 where x.campaign_id=c.id order by x.submitted_at desc,x.id desc limit 1
) s on true
group by c.status,s.review_state order by c.status,s.review_state;
select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('kinto_deals_v1_campaigns','kinto_deals_v1_submissions','kinto_deals_v1_flags')
 and column_name in ('id','store_id','status','starts_at','ends_at','review_state','submitted_at','published_at','is_published','enabled','key')
order by table_name,ordinal_position;
select e.decision,count(*) as event_count from public.kinto_deals_v1_review_events e group by e.decision order by e.decision;
