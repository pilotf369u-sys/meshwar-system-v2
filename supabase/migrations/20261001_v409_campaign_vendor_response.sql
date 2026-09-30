-- V409 — make vendor campaign responses operational and expose responder store names to admin.
-- Rejection removes that store from campaign advertising/issuance eligibility.
-- Acceptance keeps the store participating. No order/payment/shipping/invoice changes.

alter table public.kinto_admin_notifications
  add column if not exists campaign_id uuid null references public.kinto_campaigns(id) on delete set null;

create index if not exists kinto_admin_notifications_campaign_idx
  on public.kinto_admin_notifications(campaign_id);

-- Backfill campaign notifications created by V405 before campaign_id existed.
update public.kinto_admin_notifications n
set campaign_id=c.id
from public.kinto_campaigns c
where n.campaign_id is null
  and n.kind='campaign'
  and n.title='حملة KINTO: '||c.title
  and abs(extract(epoch from (n.created_at-c.created_at))) < 300;

create or replace function public.vendor_notification_action_v391(
 p_session_token text,p_notification_id uuid,p_action text
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare sid text;a text;cid uuid;
begin
 sid:=private.require_vendor_session(p_session_token)::text;
 if coalesce(sid,'')='' then raise exception 'VENDOR_SESSION_INVALID'; end if;
 a:=lower(trim(coalesce(p_action,'')));
 if a not in('read','accepted','rejected') then raise exception 'invalid action'; end if;

 select n.campaign_id into cid
 from public.kinto_admin_notification_recipients r
 join public.kinto_admin_notifications n on n.id=r.notification_id
 where r.notification_id=p_notification_id and r.store_id=sid
 for update of r;

 if not found then raise exception 'notification not found'; end if;

 update public.kinto_admin_notification_recipients
 set read_at=coalesce(read_at,now()),
     response=case when a in('accepted','rejected') then a else response end,
     responded_at=case when a in('accepted','rejected') then now() else responded_at end
 where notification_id=p_notification_id and store_id=sid;

 if cid is not null then
   if a='rejected' then
     delete from public.kinto_campaign_stores where campaign_id=cid and store_id=sid;
   elsif a='accepted' then
     insert into public.kinto_campaign_stores(campaign_id,store_id)
     select cid,s.id::text from public.local_stores s
     where s.id::text=sid and lower(trim(coalesce(s.status,'')))='active'
     on conflict do nothing;
   end if;
 end if;

 return jsonb_build_object('ok',true,'campaign_id',cid,'campaign_participating',
   case when cid is null then null else exists(select 1 from public.kinto_campaign_stores where campaign_id=cid and store_id=sid) end);
end $$;

create or replace function public.admin_vendor_notifications_v391(
 p_session_token text,p_limit integer default 100
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 return coalesce((
   select jsonb_agg(x order by x.created_at desc) from(
     select n.id,n.title,n.body,n.kind,n.created_at,n.campaign_id,
       count(r.store_id)::int recipients,
       count(r.read_at)::int read_count,
       count(*) filter(where r.response='accepted')::int accepted_count,
       count(*) filter(where r.response='rejected')::int rejected_count,
       coalesce(jsonb_agg(jsonb_build_object('store_id',r.store_id,'store_name',coalesce(s.store_name,r.store_id),'response',r.response,'responded_at',r.responded_at)
         order by coalesce(s.store_name,r.store_id)) filter(where r.response in('accepted','rejected')),'[]'::jsonb) responses
     from public.kinto_admin_notifications n
     join public.kinto_admin_notification_recipients r on r.notification_id=n.id
     left join public.local_stores s on s.id::text=r.store_id
     group by n.id order by n.created_at desc limit greatest(1,least(coalesce(p_limit,100),200))
   ) x
 ),'[]'::jsonb);
end $$;

-- Future campaign notifications are explicitly linked to their campaign.
create or replace function public.admin_create_kinto_campaign_v400(
  p_session_token text,p_title text,p_reward_amount bigint,p_starts_at timestamptz,p_ends_at timestamptz,
  p_store_ids text[] default null,p_all_stores boolean default false,p_display_text text default null
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;cid uuid;cnt integer:=0;t text;d text;nid uuid;ncnt integer:=0;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 t:=trim(coalesce(p_title,''));
 if length(t) not between 2 and 160 then raise exception 'invalid campaign title'; end if;
 if p_reward_amount not in(1000,2000,3000,5000,10000) then raise exception 'invalid campaign reward'; end if;
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'invalid campaign period'; end if;
 if not coalesce(p_all_stores,false) and coalesce(cardinality(p_store_ids),0)=0 then raise exception 'campaign store required'; end if;
 d:=nullif(trim(coalesce(p_display_text,'')),'');
 if d is not null and length(d) not between 2 and 120 then raise exception 'invalid campaign display text'; end if;

 insert into public.kinto_campaigns(title,reward_amount,currency,starts_at,ends_at,display_text,created_by)
 values(t,p_reward_amount,'IQD',p_starts_at,p_ends_at,d,aid) returning id into cid;

 if coalesce(p_all_stores,false) then
   insert into public.kinto_campaign_stores(campaign_id,store_id)
   select cid,s.id::text from public.local_stores s where lower(trim(coalesce(s.status,'')))='active' on conflict do nothing;
 else
   insert into public.kinto_campaign_stores(campaign_id,store_id)
   select cid,s.id::text from public.local_stores s where s.id::text=any(p_store_ids)
     and lower(trim(coalesce(s.status,'')))='active' on conflict do nothing;
 end if;
 get diagnostics cnt=row_count;
 if cnt=0 then raise exception 'no active campaign stores'; end if;

 insert into public.kinto_admin_notifications(title,body,kind,created_by,campaign_id)
 values('حملة KINTO: '||t,
   'تمت إضافة متجرك إلى حملة KINTO بقيمة مكافأة '||to_char(p_reward_amount,'FM999G999G999')||
   ' IQD. الفترة: '||to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||
   ' UTC إلى '||to_char(p_ends_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.',
   'campaign',aid,cid) returning id into nid;

 insert into public.kinto_admin_notification_recipients(notification_id,store_id)
 select nid,cs.store_id from public.kinto_campaign_stores cs where cs.campaign_id=cid on conflict do nothing;
 get diagnostics ncnt=row_count;
 return jsonb_build_object('ok',true,'campaign_id',cid,'stores',cnt,'reward_amount',p_reward_amount,'currency','IQD',
   'notification_id',nid,'notified_stores',ncnt);
end $$;

revoke all on function public.vendor_notification_action_v391(text,uuid,text) from public;
revoke all on function public.admin_vendor_notifications_v391(text,integer) from public;
revoke all on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) from public;
grant execute on function public.vendor_notification_action_v391(text,uuid,text) to anon,authenticated;
grant execute on function public.admin_vendor_notifications_v391(text,integer) to anon,authenticated;
grant execute on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) to anon,authenticated;
