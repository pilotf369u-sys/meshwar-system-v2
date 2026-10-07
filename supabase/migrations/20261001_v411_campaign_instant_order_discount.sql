-- V411 — KINTO campaigns are an instant, order-locked discount.
-- No campaign coupons are issued. The discount snapshot is frozen on order INSERT.
-- Existing V310 vendor/customer coupon rewards remain separate and unchanged.

alter table public.orders
  add column if not exists kinto_campaign_id uuid null references public.kinto_campaigns(id) on delete set null,
  add column if not exists kinto_campaign_discount_amount numeric not null default 0,
  add column if not exists kinto_campaign_discount_currency text null,
  add column if not exists kinto_campaign_discount_snapshot jsonb not null default '{}'::jsonb;

create index if not exists orders_kinto_campaign_idx
  on public.orders(kinto_campaign_id)
  where kinto_campaign_id is not null;

create or replace function public.kinto_campaign_order_discount_v411()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  sid text;
  cur text;
  camp record;
  product_total numeric;
  amount numeric;
begin
  -- Never overwrite an already frozen campaign snapshot.
  if new.kinto_campaign_id is not null
     or coalesce(new.kinto_campaign_discount_amount,0)>0 then
    return new;
  end if;

  sid:=public.kinto_order_store_id_v310(new);
  cur:=public.kinto_normalize_currency_v310(new.currency);
  product_total:=greatest(coalesce(new.total_price,0),0);

  if sid is null or cur<>'IQD' or product_total<=0 then
    return new;
  end if;

  -- One deterministic active campaign per order. The store must have ACCEPTED,
  -- because kinto_campaign_stores is populated only on vendor acceptance (V410).
  select c.id,c.title,c.reward_amount,c.currency,c.starts_at,c.ends_at,c.display_text
    into camp
  from public.kinto_campaigns c
  join public.kinto_campaign_stores cs
    on cs.campaign_id=c.id and cs.store_id=sid
  where c.status='active'
    and statement_timestamp()>=c.starts_at
    and statement_timestamp()<c.ends_at
  order by c.created_at,c.id
  limit 1;

  if not found then return new; end if;

  -- Campaign discount is funded by KINTO and applies to products only.
  -- It can never make the product total negative.
  amount:=least(camp.reward_amount::numeric,product_total);
  if amount<=0 then return new; end if;

  new.kinto_campaign_id:=camp.id;
  new.kinto_campaign_discount_amount:=amount;
  new.kinto_campaign_discount_currency:='IQD';
  new.kinto_campaign_discount_snapshot:=jsonb_build_object(
    'source','kinto_campaign_v411',
    'campaign_id',camp.id,
    'campaign_title',camp.title,
    'amount',amount,
    'currency','IQD',
    'store_id',sid,
    'product_total_at_order',product_total,
    'shipping_discount',0,
    'funded_by','kinto',
    'locked_at',statement_timestamp()
  );

  return new;
exception when others then
  -- Campaigns remain ancillary and must never block canonical order creation.
  raise warning 'KINTO_V411_CAMPAIGN_DISCOUNT_SKIPPED order=% error=%',new.id,sqlerrm;
  return new;
end $$;

drop trigger if exists trg_kinto_campaign_order_discount_v411 on public.orders;
create trigger trg_kinto_campaign_order_discount_v411
before insert on public.orders
for each row execute function public.kinto_campaign_order_discount_v411();

-- V400 coupon issuer is retired. Keep the old trigger name/function harmless for
-- migration compatibility, but it no longer issues or stores campaign coupons.
drop trigger if exists trg_kinto_campaign_order_insert_v400 on public.orders;

create or replace function public.kinto_campaign_order_insert_v400()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  return new;
end $$;

create or replace function public.kinto_issue_campaign_rewards_v400(o public.orders)
returns integer
language sql security definer
set search_path=public,pg_temp as $$
  select 0
$$;

revoke all on function public.kinto_campaign_order_discount_v411() from public,anon,authenticated;
revoke all on function public.kinto_issue_campaign_rewards_v400(public.orders) from public,anon,authenticated;
revoke all on function public.kinto_campaign_order_insert_v400() from public,anon,authenticated;

-- Do not alter total_price here: existing invoices and order flows already treat it
-- as product subtotal and subtract reward discounts separately. V411 exposes the
-- frozen campaign amount as a separate order field so every invoice can subtract it
-- without touching shipping.
