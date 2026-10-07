-- V405 — automatically notify participating vendors when an admin creates a KINTO campaign.
-- Communication only. Does not change order, reward issuance, redemption, shipping, invoice or vendor earn-rate logic.

create or replace function public.admin_create_kinto_campaign_v400(
  p_session_token text,
  p_title text,
  p_reward_amount bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_store_ids text[] default null,
  p_all_stores boolean default false,
  p_display_text text default null
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare
  aid text; cid uuid; cnt integer:=0; t text; d text; nid uuid; ncnt integer:=0;
begin
  aid:=private.require_admin_session_v147(p_session_token);
  if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
  t:=trim(coalesce(p_title,''));
  if length(t) not between 2 and 160 then raise exception 'invalid campaign title'; end if;
  if p_reward_amount not in(1000,2000,3000,5000,10000) then
    raise exception 'allowed campaign rewards are 1000, 2000, 3000, 5000 or 10000 IQD';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'invalid campaign period'; end if;
  if not coalesce(p_all_stores,false) and coalesce(cardinality(p_store_ids),0)=0 then raise exception 'campaign store required'; end if;
  d:=nullif(trim(coalesce(p_display_text,'')),'');
  if d is not null and length(d) not between 2 and 120 then raise exception 'invalid campaign display text'; end if;

  insert into public.kinto_campaigns(title,reward_amount,currency,starts_at,ends_at,display_text,created_by)
  values(t,p_reward_amount,'IQD',p_starts_at,p_ends_at,d,aid)
  returning id into cid;

  if coalesce(p_all_stores,false) then
    insert into public.kinto_campaign_stores(campaign_id,store_id)
    select cid,s.id::text from public.local_stores s
    where lower(trim(coalesce(s.status,'')))='active'
    on conflict do nothing;
  else
    insert into public.kinto_campaign_stores(campaign_id,store_id)
    select cid,s.id::text from public.local_stores s
    where s.id::text=any(p_store_ids)
      and lower(trim(coalesce(s.status,'')))='active'
    on conflict do nothing;
  end if;
  get diagnostics cnt=row_count;
  if cnt=0 then raise exception 'no active campaign stores'; end if;

  -- One notification object, recipient rows only for stores actually attached to this campaign.
  insert into public.kinto_admin_notifications(title,body,kind,created_by)
  values(
    'حملة KINTO: '||t,
    'تمت إضافة متجرك إلى حملة KINTO بقيمة مكافأة '||
      to_char(p_reward_amount,'FM999G999G999')||' IQD. الفترة: '||
      to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC إلى '||
      to_char(p_ends_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.',
    'campaign',
    aid
  )
  returning id into nid;

  insert into public.kinto_admin_notification_recipients(notification_id,store_id)
  select nid,cs.store_id
  from public.kinto_campaign_stores cs
  where cs.campaign_id=cid
  on conflict do nothing;
  get diagnostics ncnt=row_count;

  return jsonb_build_object(
    'ok',true,'campaign_id',cid,'stores',cnt,
    'reward_amount',p_reward_amount,'currency','IQD',
    'notification_id',nid,'notified_stores',ncnt
  );
end $$;

revoke all on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) from public;
grant execute on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) to anon,authenticated;
