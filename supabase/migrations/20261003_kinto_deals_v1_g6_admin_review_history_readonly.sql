-- KINTO DEALS G6: read-only admin review history. Apply manually after CI approval.
begin;
create or replace function public.kinto_deals_v1_admin_review_history_g6(
 p_session_token text,p_state text default 'all',p_limit integer default 100)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_admin text;v_items jsonb;v_total bigint;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'DEALS_ADMIN_SESSION_REQUIRED' using errcode='28000';end if;
 if p_state is null or p_state not in ('all','pending','approved','rejected') then raise exception 'DEALS_INVALID_REVIEW_FILTER' using errcode='22023';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'DEALS_INVALID_PAGE_LIMIT' using errcode='22023';end if;
 select count(*) into v_total from public.kinto_deals_v1_submissions s
 where p_state='all' or (p_state='pending' and s.review_state='pending')
 or (p_state='approved' and s.review_state='acknowledged')
 or (p_state='rejected' and s.review_state='rejected');
 select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at desc),'[]'::jsonb) into v_items
 from (select s.id as submission_id,s.campaign_id,s.store_id,s.title_snapshot,s.submitted_at,s.revision,
 s.review_state,s.reviewed_at,s.rejection_reason,st.store_name,c.kind
 from public.kinto_deals_v1_submissions s
 join public.kinto_deals_v1_campaigns c on c.id=s.campaign_id and c.store_id=s.store_id
 join public.local_stores st on st.id=s.store_id
 where p_state='all' or (p_state='pending' and s.review_state='pending')
 or (p_state='approved' and s.review_state='acknowledged')
 or (p_state='rejected' and s.review_state='rejected')
 order by s.submitted_at desc,s.id desc limit p_limit)q;
 return jsonb_build_object('total_count',v_total,'items',v_items);
end;$deals$;
revoke all on function public.kinto_deals_v1_admin_review_history_g6(text,text,integer) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_admin_review_history_g6(text,text,integer) to anon,authenticated;
commit;