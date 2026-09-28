-- V310 — secure KINTO coupon loyalty
-- Final model: earn 1% of product total after delivery; every 1000 whole points becomes
-- one server-side coupon unit. Coupon units expire after 30 days, remain visible as
-- expired for 10 more days, and may be combined as 1000 / 3000 / 5000 at redemption.
-- Redemption is customer-initiated, server-validated, limited to 10% of product total,
-- and never discounts shipping.

create table if not exists public.kinto_loyalty_settings(
  id smallint primary key default 1 check(id=1),
  earn_rate numeric(12,8) not null default .01 check(earn_rate>=0),
  coupon_unit bigint not null default 1000 check(coupon_unit=1000),
  coupon_days integer not null default 30 check(coupon_days between 1 and 365),
  expired_visible_days integer not null default 10 check(expired_visible_days between 1 and 90),
  max_order_ratio numeric(8,6) not null default .10 check(max_order_ratio>0 and max_order_ratio<=1),
  updated_at timestamptz not null default now()
);
insert into public.kinto_loyalty_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.kinto_loyalty_wallets(
  customer_id text not null,
  currency text not null,
  progress_points bigint not null default 0 check(progress_points>=0 and progress_points<1000),
  fractional_carry numeric(20,8) not null default 0 check(fractional_carry>=0 and fractional_carry<1),
  updated_at timestamptz not null default now(),
  primary key(customer_id,currency)
);

create table if not exists public.kinto_loyalty_coupons(
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  currency text not null,
  points bigint not null default 1000 check(points=1000),
  source_order_id text,
  status text not null default 'active' check(status in('active','used')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_order_id text,
  used_at timestamptz
);
create index if not exists kinto_loyalty_coupons_customer_idx on public.kinto_loyalty_coupons(customer_id,currency,issued_at);
create index if not exists kinto_loyalty_coupons_active_idx on public.kinto_loyalty_coupons(customer_id,currency,expires_at) where status='active';

create table if not exists public.kinto_loyalty_ledger(
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  order_id text,
  event_type text not null check(event_type in('earn','redeem','restore','admin_bonus')),
  points bigint not null,
  currency text not null,
  note text,
  actor_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists kinto_loyalty_one_earn_per_order
  on public.kinto_loyalty_ledger(order_id,event_type) where event_type='earn' and order_id is not null;
create unique index if not exists kinto_loyalty_one_redeem_per_order
  on public.kinto_loyalty_ledger(order_id,event_type) where event_type='redeem' and order_id is not null;
create unique index if not exists kinto_loyalty_one_restore_per_order
  on public.kinto_loyalty_ledger(order_id,event_type) where event_type='restore' and order_id is not null;

alter table public.orders add column if not exists loyalty_points_earned bigint not null default 0;
alter table public.orders add column if not exists loyalty_points_redeemed bigint not null default 0;

alter table public.kinto_loyalty_settings enable row level security;
alter table public.kinto_loyalty_wallets enable row level security;
alter table public.kinto_loyalty_coupons enable row level security;
alter table public.kinto_loyalty_ledger enable row level security;
revoke all on public.kinto_loyalty_settings from public,anon,authenticated;
revoke all on public.kinto_loyalty_wallets from public,anon,authenticated;
revoke all on public.kinto_loyalty_coupons from public,anon,authenticated;
revoke all on public.kinto_loyalty_ledger from public,anon,authenticated;

create or replace function public.kinto_normalize_currency_v310(v text) returns text
language plpgsql immutable security definer set search_path=public as $$
declare c text;
begin
  c:=upper(trim(coalesce(v,'IQD')));
  if c in('$','US$') then c:='USD'; end if;
  if c in('TL','₺') then c:='TRY'; end if;
  if c not in('USD','IQD','TRY') then raise exception 'unsupported currency'; end if;
  return c;
end $$;
revoke all on function public.kinto_normalize_currency_v310(text) from public,anon,authenticated;

create or replace function public.kinto_credit_points_v310(
  p_customer_id text,p_currency text,p_whole_points bigint,p_fraction numeric,
  p_source_order_id text default null,p_note text default null,p_actor_id text default null
) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare c text; unit bigint; days integer; cur bigint; n bigint:=0;
begin
  if coalesce(p_customer_id,'')='' then raise exception 'customer required'; end if;
  if coalesce(p_whole_points,0)<0 then raise exception 'negative points not allowed'; end if;
  c:=public.kinto_normalize_currency_v310(p_currency);
  select coupon_unit,coupon_days into unit,days from public.kinto_loyalty_settings where id=1;
  insert into public.kinto_loyalty_wallets(customer_id,currency,progress_points,fractional_carry)
    values(p_customer_id,c,0,0) on conflict do nothing;
  update public.kinto_loyalty_wallets
    set progress_points=progress_points+coalesce(p_whole_points,0),
        fractional_carry=greatest(0,least(coalesce(p_fraction,0),.99999999)),
        updated_at=now()
    where customer_id=p_customer_id and currency=c
    returning progress_points into cur;
  while cur>=unit loop
    insert into public.kinto_loyalty_coupons(customer_id,currency,points,source_order_id,expires_at)
      values(p_customer_id,c,unit,p_source_order_id,now()+make_interval(days=>days));
    cur:=cur-unit;n:=n+1;
  end loop;
  update public.kinto_loyalty_wallets set progress_points=cur,updated_at=now()
    where customer_id=p_customer_id and currency=c;
  return n;
end $$;
revoke all on function public.kinto_credit_points_v310(text,text,bigint,numeric,text,text,text) from public,anon,authenticated;

create or replace function public.kinto_loyalty_order_v310() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare c text;r numeric;x numeric;whole bigint;carry numeric;
begin
  c:=public.kinto_normalize_currency_v310(new.currency);
  if new.status='تم التسليم'
     and coalesce(old.status,'')<>'تم التسليم'
     and coalesce(new.total_price,0)>0
     and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id::text and event_type='earn') then
    select earn_rate into r from public.kinto_loyalty_settings where id=1;
    insert into public.kinto_loyalty_wallets(customer_id,currency) values(new.customer_id::text,c) on conflict do nothing;
    select fractional_carry into carry from public.kinto_loyalty_wallets
      where customer_id=new.customer_id and currency=c for update;
    x:=coalesce(new.total_price,0)*coalesce(r,.01)+coalesce(carry,0);
    whole:=floor(x);carry:=x-whole;
    perform public.kinto_credit_points_v310(new.customer_id::text,c,whole,carry,new.id,'delivered_order',null);
    insert into public.kinto_loyalty_ledger(customer_id,order_id,event_type,points,currency,note)
      values(new.customer_id::text,new.id::text,'earn',whole,c,'1_percent_after_delivery');
    new.loyalty_points_earned:=whole;
  end if;

  if coalesce(new.status,'') in('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')
     and coalesce(old.status,'') not in('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')
     and coalesce(new.loyalty_points_redeemed,0)>0
     and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id::text and event_type='restore') then
    update public.kinto_loyalty_coupons
      set status='active',used_order_id=null,used_at=null
      where used_order_id=new.id::text and status='used';
    insert into public.kinto_loyalty_ledger(customer_id,order_id,event_type,points,currency,note)
      values(new.customer_id::text,new.id::text,'restore',new.loyalty_points_redeemed,
             coalesce(new.reward_discount_currency,c),'cancelled_order_original_expiry_restored');
    new.loyalty_points_redeemed:=0;
    new.reward_discount_amount:=0;
    new.reward_discount_currency:=null;
    new.reward_discount_snapshot:=null;
  end if;
  return new;
end $$;
drop trigger if exists trg_kinto_loyalty_order_v310 on public.orders;
create trigger trg_kinto_loyalty_order_v310
before update of status on public.orders
for each row execute function public.kinto_loyalty_order_v310();

create or replace function public.customer_loyalty_summary_v310(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare cid text;visible_days integer;
begin
  cid:=private.require_customer_session_v150(p_session_token);
  if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
  select expired_visible_days into visible_days from public.kinto_loyalty_settings where id=1;
  return jsonb_build_object(
    'wallets',coalesce((select jsonb_agg(jsonb_build_object(
      'currency',currency,'progress_points',progress_points,'fractional_carry',fractional_carry
    ) order by currency) from public.kinto_loyalty_wallets where customer_id=cid),'[]'::jsonb),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'currency',currency,'points',points,
      'status',case when status='used' then 'used' when expires_at<=now() then 'expired' else 'active' end,
      'issued_at',issued_at,'expires_at',expires_at,'used_at',used_at,'used_order_id',used_order_id
    ) order by issued_at desc)
      from public.kinto_loyalty_coupons
      where customer_id=cid and (status='used' or expires_at>now()-make_interval(days=>visible_days))
    ),'[]'::jsonb),
    'eligible_orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'order_code',coalesce(order_code,reference_order_no,id),'currency',public.kinto_normalize_currency_v310(currency),
      'product_total',coalesce(total_price,0),'max_coupon',floor(coalesce(total_price,0)*.10/1000)*1000,'status',status
    ) order by created_at desc)
      from public.orders where customer_id::text=cid
        and status in('بانتظار موافقة العميل','قيد الطلب','بانتظار الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة')
        and coalesce(reward_discount_amount,0)=0
    ),'[]'::jsonb)
  );
end $$;
revoke all on function public.customer_loyalty_summary_v310(text) from public;
grant execute on function public.customer_loyalty_summary_v310(text) to anon,authenticated;

create or replace function public.customer_apply_coupon_v310(
  p_session_token text,p_order_id text,p_points bigint
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare cid text;o public.orders%rowtype;c text;ratio numeric;unit bigint;need integer;ids uuid[];cnt integer;cap bigint;
begin
  cid:=private.require_customer_session_v150(p_session_token);
  if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
  if p_points not in(1000,3000,5000) then raise exception 'invalid coupon tier'; end if;
  select * into o from public.orders where id::text=p_order_id for update;
  if not found or o.customer_id::text<>cid then raise exception 'order not found'; end if;
  if o.status not in('بانتظار موافقة العميل','قيد الطلب','بانتظار الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة') then
    raise exception 'coupon not allowed at this order stage';
  end if;
  if coalesce(o.reward_discount_amount,0)>0 or coalesce(o.loyalty_points_redeemed,0)>0 then raise exception 'order already has reward discount'; end if;
  c:=public.kinto_normalize_currency_v310(o.currency);
  select max_order_ratio,coupon_unit into ratio,unit from public.kinto_loyalty_settings where id=1;
  cap:=floor(coalesce(o.total_price,0)*ratio);
  if p_points>cap then raise exception 'coupon exceeds 10 percent limit'; end if;
  need:=p_points/unit;
  select array_agg(id order by expires_at,issued_at),count(*) into ids,cnt
    from (select id,expires_at,issued_at from public.kinto_loyalty_coupons
          where customer_id=cid and currency=c and status='active' and expires_at>now()
          order by expires_at,issued_at for update skip locked limit need)q;
  if coalesce(cnt,0)<>need then raise exception 'insufficient active coupons'; end if;
  update public.kinto_loyalty_coupons set status='used',used_order_id=o.id,used_at=now() where id=any(ids);
  update public.orders set loyalty_points_redeemed=p_points,reward_discount_amount=p_points,
    reward_discount_currency=c,
    reward_discount_snapshot=jsonb_build_object('amount',p_points,'currency',c,'source','kinto_coupon_v310','points',p_points,'coupon_ids',to_jsonb(ids))
    where id=o.id;
  insert into public.kinto_loyalty_ledger(customer_id,order_id,event_type,points,currency,note)
    values(cid,o.id::text,'redeem',-p_points,c,'customer_selected_coupon');
  return jsonb_build_object('ok',true,'points',p_points,'currency',c,'order_id',o.id);
end $$;
revoke all on function public.customer_apply_coupon_v310(text,text,bigint) from public;
grant execute on function public.customer_apply_coupon_v310(text,text,bigint) to anon,authenticated;

create or replace function public.employee_loyalty_overview_v310(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare eid text;
begin
  eid:=private.require_employee_session_v143(p_session_token);
  if coalesce(eid,'')='' then raise exception 'invalid employee session'; end if;
  return jsonb_build_object(
    'wallets',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'currency',currency,'progress_points',progress_points) order by customer_id,currency) from public.kinto_loyalty_wallets),'[]'::jsonb),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'currency',currency,'status',case when status='used' then 'used' when expires_at<=now() then 'expired' else 'active' end,'points',points,'expires_at',expires_at)) from public.kinto_loyalty_coupons),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'code',code) order by name) from public.customers),'[]'::jsonb)
  );
end $$;
revoke all on function public.employee_loyalty_overview_v310(text) from public;
grant execute on function public.employee_loyalty_overview_v310(text) to anon,authenticated;

create or replace function public.admin_loyalty_overview_v310(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;
begin
  aid:=private.require_admin_session_v147(p_session_token);
  if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
  return jsonb_build_object(
    'wallets',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'currency',currency,'progress_points',progress_points) order by customer_id,currency) from public.kinto_loyalty_wallets),'[]'::jsonb),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'currency',currency,'status',case when status='used' then 'used' when expires_at<=now() then 'expired' else 'active' end,'points',points,'expires_at',expires_at,'used_order_id',used_order_id)) from public.kinto_loyalty_coupons),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'code',code) order by name) from public.customers),'[]'::jsonb)
  );
end $$;
revoke all on function public.admin_loyalty_overview_v310(text) from public;
grant execute on function public.admin_loyalty_overview_v310(text) to anon,authenticated;

create or replace function public.admin_loyalty_grant_points_v310(
  p_session_token text,p_customer_id text,p_points bigint,p_currency text,p_reason text
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;c text;carry numeric;issued bigint;
begin
  aid:=private.require_admin_session_v147(p_session_token);
  if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
  if p_points<=0 or nullif(trim(p_reason),'') is null then raise exception 'positive integer points and reason required'; end if;
  c:=public.kinto_normalize_currency_v310(p_currency);
  insert into public.kinto_loyalty_wallets(customer_id,currency) values(p_customer_id,c) on conflict do nothing;
  select fractional_carry into carry from public.kinto_loyalty_wallets where customer_id=p_customer_id and currency=c for update;
  issued:=public.kinto_credit_points_v310(p_customer_id,c,p_points,carry,null,'admin_bonus',aid);
  insert into public.kinto_loyalty_ledger(customer_id,event_type,points,currency,note,actor_id)
    values(p_customer_id,'admin_bonus',p_points,c,trim(p_reason),aid);
  return jsonb_build_object('ok',true,'points',p_points,'currency',c,'coupons_issued',issued);
end $$;
revoke all on function public.admin_loyalty_grant_points_v310(text,text,bigint,text,text) from public;
grant execute on function public.admin_loyalty_grant_points_v310(text,text,bigint,text,text) to anon,authenticated;
