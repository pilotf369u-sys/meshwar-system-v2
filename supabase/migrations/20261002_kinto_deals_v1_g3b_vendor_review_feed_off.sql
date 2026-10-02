-- KINTO DEALS G3B: merchant read-only campaign review feed.
-- Does not submit/publish/activate a campaign or write to existing commerce tables.
begin;
create or replace function public.kinto_deals_v1_vendor_review_feed_g3(
 p_session_token text,p_limit integer default 30)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid; v_items jsonb; v_pending bigint;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_limit is null or p_limit not between 1 and 100 then
   raise exception 'DEALS_INVALID_PAGE_LIMIT' using errcode='22023'; end if;
 select count(*) into v_pending from public.kinto_deals_v1_submissions s
 where s.store_id=v_store and s.review_state='pending';
 select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at desc),'[]'::jsonb)
 into v_items from (
  select s.id as submission_id,s.campaign_id,s.title_snapshot,s.summary_snapshot,
   s.submitted_at,s.reviewed_at,s.review_state,s.rejection_reason,s.revision,
   c.status as campaign_status,c.kind,c.starts_at,c.ends_at,
   case
    when s.review_state='rejected' then 'rejected'
    when s.review_state='pending' then 'pending_review'
    when s.review_state='acknowledged' and c.status='paused' then 'paused'
    when s.review_state='acknowledged' and c.ends_at<=clock_timestamp() then 'expired'
    when s.review_state='acknowledged' and c.starts_at>clock_timestamp() then 'approved_scheduled'
    when s.review_state='acknowledged' and c.status='active' then 'active'
    when s.review_state='acknowledged' then 'approved_not_published'
    else 'unknown'
   end as display_state
  from public.kinto_deals_v1_submissions s
  join public.kinto_deals_v1_campaigns c on c.id=s.campaign_id and c.store_id=s.store_id
  where s.store_id=v_store
  order by s.submitted_at desc,s.id desc limit p_limit
 ) q;
 return jsonb_build_object('pending_count',v_pending,'items',v_items);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_review_feed_g3(text,integer)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_review_feed_g3(text,integer)
 to anon,authenticated;
commit;
