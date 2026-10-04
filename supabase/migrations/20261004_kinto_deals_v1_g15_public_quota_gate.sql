-- G15: public display stops at the earlier of expiry or allocated campaign quota.
-- Read-only gate. Only confirmed (paid) redemptions consume quota; pending carts/orders do not.
-- No change to order, checkout, stock, redemption writes or feature activation.
begin;
create or replace function public.kinto_deals_v1_public_feed_g7(p_store_id uuid default null)
returns table(campaign_id uuid,store_id uuid,title text,description text,kind text,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path=public,private,pg_temp
as $feed$
 select c.id,c.store_id,c.title,c.description,c.kind,c.starts_at,c.ends_at
 from public.kinto_deals_v1_campaigns c
 join public.kinto_deals_v1_publications_g7 pub on pub.campaign_id=c.id
 join public.local_stores st on st.id=c.store_id
 join lateral (
   select s.id,s.review_state from public.kinto_deals_v1_submissions s
   where s.campaign_id=c.id order by s.submitted_at desc,s.id desc limit 1
 ) latest on true
 where pub.published=true and pub.published_at is not null
   and c.status='submitted' and st.status='active'
   and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()
   and latest.review_state='acknowledged'
   and exists(select 1 from public.kinto_deals_v1_review_events e
     where e.submission_id=latest.id and e.campaign_id=c.id and e.store_id=c.store_id
       and e.decision='approved')
   and (
     c.max_total_redemptions is null
     or (
       select count(*) from public.kinto_deals_v1_redemptions r
       where r.campaign_id=c.id and r.state='confirmed'
     ) < c.max_total_redemptions
   )
   and (p_store_id is null or c.store_id=p_store_id)
 order by c.ends_at asc,c.id asc limit 200
$feed$;
comment on function public.kinto_deals_v1_public_feed_g7(uuid) is
'Published approved live campaigns only; hides expired or fully allocated campaigns. Only confirmed paid redemptions consume display quota.';
commit;
