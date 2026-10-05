-- V410 — campaign invitations are pending until the vendor explicitly accepts.
-- kinto_campaign_stores remains the canonical ACCEPTED participation table.
-- Pending/rejected stores are notification recipients only and are therefore excluded
-- from campaign advertising and reward issuance until accepted.

create or replace function public.admin_create_kinto_campaign_v400(
  p_session_token text,p_title text,p_reward_amount bigint,p_starts_at timestamptz,p_ends_at timestamptz,
  p_store_ids text[] default null,p_all_stores boolean default false,p_display_text text default null
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare
  aid text;cid uuid;t text;d text;nid uuid;ncnt integer:=0;
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

  -- Campaign is created with ZERO participating stores. Participation starts only on acceptance.
  insert into public.kinto_campaigns(title,reward_amount,currency,starts_at,ends_at,display_text,created_by)
  values(t,p_reward_amount,'IQD',p_starts_at,p_ends_at,d,aid)
  returning id into cid;

  insert into public.kinto_admin_notifications(title,body,kind,created_by,campaign_id)
  values(
    'حملة KINTO: '||t,
    'دعوة للمشاركة في حملة KINTO بقيمة مكافأة '||to_char(p_reward_amount,'FM999G999G999')||
    ' IQD. لن يظهر متجرك ضمن الحملة ولن تُمنح مكافآت الحملة لطلباته إلا بعد قبولك. الفترة: '||
    to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC إلى '||
    to_char(p_ends_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.',
    'campaign',aid,cid
  ) returning id into nid;

  -- Selected active stores become invitation recipients, not campaign participants.
  if coalesce(p_all_stores,false) then
    insert into public.kinto_admin_notification_recipients(notification_id,store_id)
    select nid,s.id::text
    from public.local_stores s
    where lower(trim(coalesce(s.status,'')))='active'
    on conflict do nothing;
  else
    insert into public.kinto_admin_notification_recipients(notification_id,store_id)
    select nid,s.id::text
    from public.local_stores s
    where s.id::text=any(p_store_ids)
      and lower(trim(coalesce(s.status,'')))='active'
    on conflict do nothing;
  end if;

  get diagnostics ncnt=row_count;
  if ncnt=0 then raise exception 'no active campaign stores'; end if;

  return jsonb_build_object(
    'ok',true,'campaign_id',cid,'stores',ncnt,'invited_stores',ncnt,
    'accepted_stores',0,'reward_amount',p_reward_amount,'currency','IQD',
    'notification_id',nid,'notified_stores',ncnt
  );
end $$;

-- Acceptance is the ONLY path that adds a vendor to campaign participation.
create or replace function public.vendor_notification_action_v391(
 p_session_token text,p_notification_id uuid,p_action text
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare sid text;a text;cid uuid;cstatus text;cend timestamptz;
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

 if cid is not null and a='accepted' then
   select status,ends_at into cstatus,cend from public.kinto_campaigns where id=cid;
   if cstatus is distinct from 'active' or cend<=now() then
     raise exception 'campaign is no longer available';
   end if;
 end if;

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

 return jsonb_build_object(
   'ok',true,'campaign_id',cid,
   'campaign_participating',
   case when cid is null then null else exists(
     select 1 from public.kinto_campaign_stores where campaign_id=cid and store_id=sid
   ) end
 );
end $$;

revoke all on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) from public;
revoke all on function public.vendor_notification_action_v391(text,uuid,text) from public;
grant execute on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) to anon,authenticated;
grant execute on function public.vendor_notification_action_v391(text,uuid,text) to anon,authenticated;
