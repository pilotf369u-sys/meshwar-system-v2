-- V403 — expand KINTO campaign reward choices without changing V310 vendor rewards.
-- Campaign rewards remain IQD, multiples of the canonical 1000-IQD coupon unit.

do $$
declare n text;
begin
  select conname into n
  from pg_constraint
  where conrelid='public.kinto_campaigns'::regclass
    and contype='c'
    and pg_get_constraintdef(oid) ilike '%reward_amount%';
  if n is not null then
    execute format('alter table public.kinto_campaigns drop constraint %I',n);
  end if;
end $$;

alter table public.kinto_campaigns
  add constraint kinto_campaigns_reward_amount_v403_chk
  check (reward_amount in (1000,2000,3000,5000,10000));

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
  aid text; cid uuid; cnt integer:=0; t text; d text;
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

  return jsonb_build_object('ok',true,'campaign_id',cid,'stores',cnt,'reward_amount',p_reward_amount,'currency','IQD');
end $$;

revoke all on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) from public;
grant execute on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) to anon,authenticated;
