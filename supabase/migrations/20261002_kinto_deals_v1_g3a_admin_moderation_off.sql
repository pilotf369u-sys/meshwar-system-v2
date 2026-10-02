-- KINTO DEALS G3A: isolated admin moderation, feature flag stays OFF.
-- REVIEW ONLY until PR is green and Omar approves running this in Supabase.
-- No legacy checkout/order/stock/invoice/customer notice changes.
begin;

alter table public.kinto_deals_v1_submissions
 add column if not exists reviewed_by text,
 add column if not exists rejection_reason text,
 add column if not exists revision integer not null default 1;

-- One durable decision per submission, including who reviewed it. This is also
-- the merchant-facing decision feed for a later verified vendor read RPC.
create table if not exists public.kinto_deals_v1_review_events (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null unique references public.kinto_deals_v1_submissions(id) on delete restrict,
 campaign_id uuid not null references public.kinto_deals_v1_campaigns(id) on delete restrict,
 store_id uuid not null references public.local_stores(id) on delete restrict,
 revision integer not null check (revision >= 1),
 decision text not null check (decision in ('approved','rejected')),
 reason text,
 reviewer_id text not null,
 created_at timestamptz not null default now(),
 constraint kinto_deals_v1_rejection_reason_required check
   ((decision='approved' and reason is null) or
    (decision='rejected' and reason is not null and char_length(btrim(reason)) between 3 and 1000))
);
create index if not exists kinto_deals_v1_review_events_store_idx
 on public.kinto_deals_v1_review_events(store_id,created_at desc);
alter table public.kinto_deals_v1_review_events enable row level security;
revoke all on public.kinto_deals_v1_review_events from public,anon,authenticated;

-- Read-only inbox; admin identity comes from the verified session, never input.
create or replace function public.kinto_deals_v1_admin_inbox_g3(p_session_token text)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_admin text; v_items jsonb; v_count bigint;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'DEALS_ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 select count(*) into v_count from public.kinto_deals_v1_submissions where review_state='pending';
 select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at desc),'[]'::jsonb) into v_items
 from (
  select s.id as submission_id,s.campaign_id,s.store_id,s.title_snapshot,
    s.summary_snapshot,s.submitted_at,s.revision,c.kind,c.starts_at,c.ends_at,
    c.max_total_redemptions,c.max_uses_per_customer,c.gift_product_id
  from public.kinto_deals_v1_submissions s
  join public.kinto_deals_v1_campaigns c on c.id=s.campaign_id and c.store_id=s.store_id
  where s.review_state='pending' order by s.submitted_at desc limit 100
 ) q;
 return jsonb_build_object('pending_count',v_count,'items',v_items);
end;
$deals$;

-- Decision is atomic and row-locked: stale/duplicate clicks fail closed.
-- Approval is NOT activation, publication, or a customer notification.
create or replace function public.kinto_deals_v1_admin_decide_g3(
 p_session_token text,p_submission_id uuid,p_expected_revision integer,
 p_decision text,p_rejection_reason text default null)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_admin text; v_s public.kinto_deals_v1_submissions%rowtype;
 v_c public.kinto_deals_v1_campaigns%rowtype; v_reason text;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'DEALS_ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_decision not in ('approved','rejected') or p_decision is null then
   raise exception 'DEALS_INVALID_DECISION' using errcode='22023'; end if;
 v_reason:=nullif(btrim(coalesce(p_rejection_reason,'')),'');
 if p_decision='rejected' and (v_reason is null or char_length(v_reason) not between 3 and 1000) then
   raise exception 'DEALS_REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
 if p_decision='approved' and v_reason is not null then
   raise exception 'DEALS_APPROVAL_HAS_NO_REJECTION_REASON' using errcode='22023'; end if;
 select * into v_s from public.kinto_deals_v1_submissions where id=p_submission_id for update;
 if not found then raise exception 'DEALS_SUBMISSION_NOT_FOUND' using errcode='P0002'; end if;
 if v_s.review_state<>'pending' or v_s.revision is distinct from p_expected_revision then
   raise exception 'DEALS_STALE_OR_ALREADY_REVIEWED' using errcode='40001'; end if;
 select * into v_c from public.kinto_deals_v1_campaigns where id=v_s.campaign_id for update;
 if not found or v_c.store_id<>v_s.store_id or v_c.status<>'submitted' then
   raise exception 'DEALS_CAMPAIGN_NOT_SUBMITTED' using errcode='40001'; end if;
 if exists(select 1 from public.kinto_deals_v1_submissions s2
  where s2.campaign_id=v_s.campaign_id and s2.id<>v_s.id
  and s2.submitted_at>v_s.submitted_at) then
   raise exception 'DEALS_SUPERSEDED_SUBMISSION' using errcode='40001'; end if;
 update public.kinto_deals_v1_submissions
 set review_state=case when p_decision='approved' then 'acknowledged' else 'rejected' end,
 reviewed_at=clock_timestamp(),reviewed_by=v_admin,rejection_reason=v_reason
 where id=v_s.id;
 -- Keep approved campaign as submitted; approved_scheduled is DERIVED by
 -- review_state + server time. G4 alone may enable approved-only storefront.
 if p_decision='rejected' then
   update public.kinto_deals_v1_campaigns set status='rejected',updated_at=clock_timestamp()
   where id=v_c.id;
 end if;
 insert into public.kinto_deals_v1_review_events
 (submission_id,campaign_id,store_id,revision,decision,reason,reviewer_id)
 values(v_s.id,v_s.campaign_id,v_s.store_id,v_s.revision,p_decision,v_reason,v_admin);
 return jsonb_build_object('ok',true,'submission_id',v_s.id,'campaign_id',v_s.campaign_id,
 'decision',p_decision,'decision_event_recorded',true,'merchant_push_sent',false,'customer_broadcast_sent',false);
end;
$deals$;
revoke all on function public.kinto_deals_v1_admin_inbox_g3(text) from public,anon,authenticated;
revoke all on function public.kinto_deals_v1_admin_decide_g3(text,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_admin_inbox_g3(text) to anon,authenticated;
grant execute on function public.kinto_deals_v1_admin_decide_g3(text,uuid,integer,text,text) to anon,authenticated;
-- G3A does NOT grant vendor submit or publish; no review events exposed directly.
commit;
