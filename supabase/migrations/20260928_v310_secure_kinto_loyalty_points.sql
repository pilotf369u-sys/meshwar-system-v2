-- V310 secure KINTO loyalty points
create table if not exists public.kinto_loyalty_settings(
 id smallint primary key default 1 check(id=1),earn_rate numeric(12,8) not null default .01,
 multiplier numeric(12,4) not null default 1,campaign_name text,campaign_starts_at timestamptz,campaign_ends_at timestamptz,updated_at timestamptz not null default now());
insert into public.kinto_loyalty_settings(id) values(1) on conflict(id) do nothing;
create table if not exists public.kinto_loyalty_wallets(
 customer_id text not null references public.customers(id) on delete cascade,currency text not null,points bigint not null default 0 check(points>=0),
 fractional_carry numeric(20,8) not null default 0 check(fractional_carry>=0 and fractional_carry<1),updated_at timestamptz not null default now(),primary key(customer_id,currency));
create table if not exists public.kinto_loyalty_ledger(
 id uuid primary key default gen_random_uuid(),customer_id text not null references public.customers(id) on delete cascade,order_id text references public.orders(id) on delete set null,
 event_type text not null check(event_type in('earn','redeem','restore','admin_bonus','reversal')),points bigint not null check(points<>0),currency text not null,
 base_amount numeric(20,4),earn_rate numeric(12,8),multiplier numeric(12,4),note text,actor_id uuid,created_at timestamptz not null default now());
create unique index if not exists kinto_loyalty_one_earn_per_order on public.kinto_loyalty_ledger(order_id,event_type) where event_type='earn' and order_id is not null;
create unique index if not exists kinto_loyalty_one_redeem_per_order on public.kinto_loyalty_ledger(order_id,event_type) where event_type='redeem' and order_id is not null;
create unique index if not exists kinto_loyalty_one_restore_per_order on public.kinto_loyalty_ledger(order_id,event_type) where event_type='restore' and order_id is not null;
alter table public.orders add column if not exists loyalty_points_earned bigint not null default 0;
alter table public.orders add column if not exists loyalty_points_redeemed bigint not null default 0;
alter table public.kinto_loyalty_settings enable row level security;
alter table public.kinto_loyalty_wallets enable row level security;
alter table public.kinto_loyalty_ledger enable row level security;
revoke all on public.kinto_loyalty_settings from public,anon,authenticated;
revoke all on public.kinto_loyalty_wallets from public,anon,authenticated;
revoke all on public.kinto_loyalty_ledger from public,anon,authenticated;

create or replace function public.kinto_loyalty_multiplier_v310() returns numeric language sql stable security definer set search_path=public as $$
 select case when (campaign_starts_at is not null and now()<campaign_starts_at) or (campaign_ends_at is not null and now()>=campaign_ends_at) then 1 else greatest(coalesce(multiplier,1),0) end
 from public.kinto_loyalty_settings where id=1 $$;

create or replace function public.kinto_loyalty_order_v310() returns trigger language plpgsql security definer set search_path=public as $$
declare c text;r numeric;m numeric;x numeric;whole bigint;carry numeric;bal bigint;eligible bigint;usep bigint;cancelled boolean;
begin
 c:=upper(trim(coalesce(new.currency,'USD'))); if c in('$','US$') then c:='USD'; end if; if c in('TL','₺') then c:='TRY'; end if;
 if new.status='تم التسليم' and coalesce(old.status,'')<>'تم التسليم' and coalesce(new.total_price,0)>0
 and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id and event_type='earn') then
  select earn_rate,public.kinto_loyalty_multiplier_v310() into r,m from public.kinto_loyalty_settings where id=1;
  insert into public.kinto_loyalty_wallets(customer_id,currency) values(new.customer_id,c) on conflict do nothing;
  select points,fractional_carry into bal,carry from public.kinto_loyalty_wallets where customer_id=new.customer_id and currency=c for update;
  x:=new.total_price*coalesce(r,.01)*coalesce(m,1)+coalesce(carry,0); whole:=floor(x); carry:=x-whole;
  update public.kinto_loyalty_wallets set points=points+whole,fractional_carry=carry,updated_at=now() where customer_id=new.customer_id and currency=c;
  if whole>0 then insert into public.kinto_loyalty_ledger(customer_id,order_id,event_type,points,currency,base_amount,earn_rate,multiplier,note)
   values(new.customer_id,new.id,'earn',whole,c,new.total_price,r,m,'delivered_order'); end if;
  new.loyalty_points_earned:=whole;
 end if;
 if coalesce(new.total_price,0)>0 and coalesce(new.loyalty_points_redeemed,0)=0 and coalesce(new.reward_discount_amount,0)=0 and new.status<>'تم التسليم'
 and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id and event_type='redeem') then
  insert into public.kinto_loyalty_wallets(customer_id,currency) values(new.customer_id,c) on conflict do nothing;
  select points into bal from public.kinto_loyalty_wallets where customer_id=new.customer_id and currency=c for update;
  select coalesce(sum(points),0)::bigint into eligible from public.kinto_loyalty_ledger where customer_id=new.customer_id and currency=c and created_at<coalesce(new.created_at,now());
  usep:=least(coalesce(bal,0),greatest(coalesce(eligible,0),0),floor(new.total_price)::bigint);
  if usep>0 then
   update public.kinto_loyalty_wallets set points=points-usep,updated_at=now() where customer_id=new.customer_id and currency=c;
   insert into public.kinto_loyalty_ledger(customer_id,order_id,event_type,points,currency,base_amount,note) values(new.customer_id,new.id,'redeem',-usep,c,new.total_price,'automatic_first_later_order');
   new.loyalty_points_redeemed:=usep;new.reward_discount_amount:=usep;new.reward_discount_currency:=c;
   new.reward_discount_snapshot:=jsonb_build_object('amount',usep,'currency',c,'source','kinto_points_v310','points',usep);
  end if;
 end if;
 cancelled:=coalesce(new.status,'') in('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض');
 if cancelled and not(coalesce(old.status,'') in('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')) and coalesce(new.loyalty_points_redeemed,0)>0
 and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id and event_type='restore') then
  insert into public.kinto_loyalty_wallets(customer_id,currency,points) values(new.customer_id,coalesce(new.reward_discount_currency,c),new.loyalty_points_redeemed)
  on conflict(customer_id,currency) do update set points=public.kinto_loyalty_wallets.points+excluded.points,updated_at=now();
  insert into public.kinto_loyalty_ledger(customer_id,order_id,event_type,points,currency,note) values(new.customer_id,new.id,'restore',new.loyalty_points_redeemed,coalesce(new.reward_discount_currency,c),'cancelled_order_restore');
  new.loyalty_points_redeemed:=0;new.reward_discount_amount:=0;new.reward_discount_currency:=null;new.reward_discount_snapshot:=null;
 end if;
 return new;
end $$;
drop trigger if exists trg_kinto_loyalty_order_v310 on public.orders;
create trigger trg_kinto_loyalty_order_v310 before update of status,total_price,currency on public.orders for each row execute function public.kinto_loyalty_order_v310();

create or replace function public.customer_loyalty_summary_v310(p_session_token text) returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $
declare cid text;begin cid:=private.require_customer_session_v150(p_session_token); if coalesce(cid,'')='' then raise exception 'invalid customer session';end if;
 return jsonb_build_object('wallets',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'points',points) order by currency) from public.kinto_loyalty_wallets where customer_id=cid),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('event_type',event_type,'points',points,'currency',currency,'order_id',order_id,'created_at',created_at) order by created_at desc) from (select * from public.kinto_loyalty_ledger where customer_id=cid order by created_at desc limit 50)h),'[]'::jsonb));end $$;
revoke all on function public.customer_loyalty_summary_v310(text) from public;grant execute on function public.customer_loyalty_summary_v310(text) to anon,authenticated;

create or replace function public.admin_loyalty_campaign_v310(p_session_token text,p_multiplier numeric,p_name text default null,p_starts_at timestamptz default null,p_ends_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare aid text;begin aid:=private.require_admin_session_v147(p_session_token);if coalesce(aid,'')='' then raise exception 'invalid admin session';end if;
 if p_multiplier<1 or p_multiplier>10 then raise exception 'multiplier must be 1..10';end if;if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then raise exception 'invalid campaign window';end if;
 update public.kinto_loyalty_settings set multiplier=p_multiplier,campaign_name=nullif(trim(p_name),''),campaign_starts_at=p_starts_at,campaign_ends_at=p_ends_at,updated_at=now() where id=1;
 return jsonb_build_object('ok',true,'multiplier',p_multiplier,'name',nullif(trim(p_name),''));end $$;
revoke all on function public.admin_loyalty_campaign_v310(text,numeric,text,timestamptz,timestamptz) from public;grant execute on function public.admin_loyalty_campaign_v310(text,numeric,text,timestamptz,timestamptz) to anon,authenticated;

create or replace function public.admin_loyalty_grant_points_v310(p_session_token text,p_customer_id text,p_points bigint,p_currency text,p_reason text) returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $
declare aid text;c text;begin aid:=private.require_admin_session_v147(p_session_token);if coalesce(aid,'')='' then raise exception 'invalid admin session';end if;
 if p_points<=0 or nullif(trim(p_reason),'') is null then raise exception 'positive integer points and reason required';end if;c:=upper(trim(p_currency));if c in('$','US$')then c:='USD';end if;if c in('TL','₺')then c:='TRY';end if;if c not in('USD','IQD','TRY')then raise exception 'unsupported currency';end if;
 insert into public.kinto_loyalty_wallets(customer_id,currency,points) values(p_customer_id,c,p_points) on conflict(customer_id,currency) do update set points=public.kinto_loyalty_wallets.points+excluded.points,updated_at=now();
 insert into public.kinto_loyalty_ledger(customer_id,event_type,points,currency,note,actor_id) values(p_customer_id,'admin_bonus',p_points,c,trim(p_reason),aid);return jsonb_build_object('ok',true,'points',p_points,'currency',c);end $$;
revoke all on function public.admin_loyalty_grant_points_v310(text,text,bigint,text,text) from public;grant execute on function public.admin_loyalty_grant_points_v310(text,text,bigint,text,text) to anon,authenticated;

create or replace function public.employee_loyalty_overview_v310(p_session_token text) returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $
declare eid text;begin eid:=private.require_employee_session_v143(p_session_token);if coalesce(eid,'')='' then raise exception 'invalid employee session';end if;
 return jsonb_build_object('wallets',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'currency',currency,'points',points) order by customer_id,currency) from public.kinto_loyalty_wallets),'[]'::jsonb),
 'settings',(select jsonb_build_object('earn_rate',earn_rate,'multiplier',public.kinto_loyalty_multiplier_v310(),'campaign_name',campaign_name) from public.kinto_loyalty_settings where id=1));end $$;
revoke all on function public.employee_loyalty_overview_v310(text) from public;grant execute on function public.employee_loyalty_overview_v310(text) to anon,authenticated;

create or replace function public.admin_loyalty_overview_v310(p_session_token text) returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $
declare aid text;begin aid:=private.require_admin_session_v147(p_session_token);if coalesce(aid,'')='' then raise exception 'invalid admin session';end if;
 return jsonb_build_object('wallets',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'currency',currency,'points',points) order by customer_id,currency) from public.kinto_loyalty_wallets),'[]'::jsonb),
 'settings',(select jsonb_build_object('earn_rate',earn_rate,'multiplier',public.kinto_loyalty_multiplier_v310(),'campaign_name',campaign_name) from public.kinto_loyalty_settings where id=1));end $$;
revoke all on function public.admin_loyalty_overview_v310(text) from public;grant execute on function public.admin_loyalty_overview_v310(text) to anon,authenticated;
