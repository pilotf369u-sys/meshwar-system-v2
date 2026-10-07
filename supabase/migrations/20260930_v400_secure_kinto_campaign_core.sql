-- V400 — secure KINTO-funded campaigns core
-- Isolated from V310 vendor rewards. Campaign rewards are issued on qualifying order creation.
-- No sale/login/tracking/invoice/shipping behavior is changed.

create table if not exists public.kinto_campaigns(
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 2 and 160),
  reward_amount bigint not null check(reward_amount in (1000,3000,5000)),
  currency text not null default 'IQD' check(currency='IQD'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  display_text text,
  status text not null default 'active' check(status in('active','paused','cancelled')),
  created_by text not null,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at),
  check(display_text is null or length(trim(display_text)) between 2 and 120)
);

create table if not exists public.kinto_campaign_stores(
  campaign_id uuid not null references public.kinto_campaigns(id) on delete cascade,
  store_id text not null,
  created_at timestamptz not null default now(),
  primary key(campaign_id,store_id)
);
create index if not exists kinto_campaign_stores_store_idx
  on public.kinto_campaign_stores(store_id,campaign_id);

create table if not exists public.kinto_campaign_awards(
  campaign_id uuid not null references public.kinto_campaigns(id) on delete restrict,
  order_id text not null,
  customer_id text not null,
  source_store_id text not null,
  reward_amount bigint not null,
  currency text not null default 'IQD',
  issued_at timestamptz not null default now(),
  primary key(campaign_id,order_id)
);
create index if not exists kinto_campaign_awards_customer_idx
  on public.kinto_campaign_awards(customer_id,issued_at desc);

-- A campaign coupon is KINTO-funded and can be redeemed at every participating store.
-- campaign_id keeps this scope explicit without changing V310 vendor-funded semantics.
alter table public.kinto_loyalty_coupons
  add column if not exists campaign_id uuid references public.kinto_campaigns(id) on delete set null;
create index if not exists kinto_loyalty_coupons_campaign_idx
  on public.kinto_loyalty_coupons(customer_id,campaign_id,currency,expires_at)
  where campaign_id is not null and status='active';

alter table public.kinto_campaigns enable row level security;
alter table public.kinto_campaign_stores enable row level security;
alter table public.kinto_campaign_awards enable row level security;
revoke all on public.kinto_campaigns,public.kinto_campaign_stores,public.kinto_campaign_awards from public,anon,authenticated;

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
  if p_reward_amount not in(1000,3000,5000) then raise exception 'allowed campaign rewards are 1000, 3000 or 5000 IQD'; end if;
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

create or replace function public.admin_set_kinto_campaign_status_v400(
  p_session_token text,p_campaign_id uuid,p_status text
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text;s text;
begin
  aid:=private.require_admin_session_v147(p_session_token);
  if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
  s:=lower(trim(coalesce(p_status,'')));
  if s not in('active','paused','cancelled') then raise exception 'invalid campaign status'; end if;
  update public.kinto_campaigns set status=s where id=p_campaign_id;
  if not found then raise exception 'campaign not found'; end if;
  return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status',s);
end $$;

create or replace function public.admin_kinto_campaigns_v400(
  p_session_token text,p_limit integer default 100
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare aid text;
begin
  aid:=private.require_admin_session_v147(p_session_token);
  if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from(
      select c.id,c.title,c.reward_amount,c.currency,c.starts_at,c.ends_at,c.display_text,c.status,c.created_at,
        count(distinct cs.store_id)::int store_count,
        count(distinct a.order_id)::int award_count
      from public.kinto_campaigns c
      left join public.kinto_campaign_stores cs on cs.campaign_id=c.id
      left join public.kinto_campaign_awards a on a.campaign_id=c.id
      group by c.id
      order by c.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),200))
    ) x
  ),'[]'::jsonb);
end $$;

-- Public read model intentionally exposes only currently active campaign advertising,
-- never admin/session data, award rows or customer data.
create or replace function public.active_kinto_campaigns_v400()
returns jsonb
language sql stable security definer
set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(x order by x.ends_at,x.title),'[]'::jsonb)
  from(
    select c.id,c.title,c.reward_amount,c.currency,c.display_text,c.starts_at,c.ends_at,
      coalesce(jsonb_agg(cs.store_id order by cs.store_id) filter(where cs.store_id is not null),'[]'::jsonb) store_ids
    from public.kinto_campaigns c
    join public.kinto_campaign_stores cs on cs.campaign_id=c.id
    where c.status='active' and now()>=c.starts_at and now()<c.ends_at
    group by c.id
  ) x
$$;

-- Internal issuer: never executable by browser roles.
create or replace function public.kinto_issue_campaign_rewards_v400(o public.orders)
returns integer
language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  sid text;c text;camp record;unit bigint;days integer;i integer;units integer;issued integer:=0;
begin
  if o.customer_id is null then return 0; end if;
  sid:=public.kinto_order_store_id_v310(o);
  c:=public.kinto_normalize_currency_v310(o.currency);
  if sid is null or c<>'IQD' or coalesce(o.total_price,0)<=0 then return 0; end if;
  select coupon_unit,coupon_days into unit,days from public.kinto_loyalty_settings where id=1;

  for camp in
    select ca.id,ca.reward_amount
    from public.kinto_campaigns ca
    join public.kinto_campaign_stores cs on cs.campaign_id=ca.id and cs.store_id=sid
    where ca.status='active' and now()>=ca.starts_at and now()<ca.ends_at
    order by ca.created_at,ca.id
  loop
    insert into public.kinto_campaign_awards(campaign_id,order_id,customer_id,source_store_id,reward_amount,currency)
    values(camp.id,o.id::text,o.customer_id::text,sid,camp.reward_amount,'IQD')
    on conflict(campaign_id,order_id) do nothing;
    if found then
      units:=camp.reward_amount/unit;
      for i in 1..units loop
        insert into public.kinto_loyalty_coupons(customer_id,store_id,currency,points,source_order_id,expires_at,funded_by,campaign_id)
        values(o.customer_id::text,sid,'IQD',unit,o.id::text,now()+make_interval(days=>days),'kinto',camp.id);
      end loop;
      issued:=issued+camp.reward_amount;
    end if;
  end loop;
  return issued;
end $$;

create or replace function public.kinto_campaign_order_insert_v400()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  -- Campaigns are ancillary. A campaign failure must never block canonical order creation.
  begin
    perform public.kinto_issue_campaign_rewards_v400(new);
  exception when others then
    raise warning 'KINTO_V400_CAMPAIGN_SKIPPED order=% error=%',new.id,sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_kinto_campaign_order_insert_v400 on public.orders;
create trigger trg_kinto_campaign_order_insert_v400
after insert on public.orders
for each row execute function public.kinto_campaign_order_insert_v400();

revoke all on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) from public;
revoke all on function public.admin_set_kinto_campaign_status_v400(text,uuid,text) from public;
revoke all on function public.admin_kinto_campaigns_v400(text,integer) from public;
revoke all on function public.active_kinto_campaigns_v400() from public;
revoke all on function public.kinto_issue_campaign_rewards_v400(public.orders) from public,anon,authenticated;
revoke all on function public.kinto_campaign_order_insert_v400() from public,anon,authenticated;

grant execute on function public.admin_create_kinto_campaign_v400(text,text,bigint,timestamptz,timestamptz,text[],boolean,text) to anon,authenticated;
grant execute on function public.admin_set_kinto_campaign_status_v400(text,uuid,text) to anon,authenticated;
grant execute on function public.admin_kinto_campaigns_v400(text,integer) to anon,authenticated;
grant execute on function public.active_kinto_campaigns_v400() to anon,authenticated;
