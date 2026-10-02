-- G5C guard-only correction based on LIVE read-only preflight.
-- orders.customer_id is TEXT; redemptions.customer_id is UUID.
-- orders has no store_id; canonical store relationship is order_store_segments.
-- No reservation RPC, checkout changes, order triggers or feature activation.
begin;
create or replace function public.kinto_deals_v1_validate_related_store()
returns trigger language plpgsql
set search_path=public,pg_temp as $deals$
declare v_store uuid;
begin
 select c.store_id into v_store
 from public.kinto_deals_v1_campaigns c where c.id=new.campaign_id;
 if v_store is null or new.store_id is distinct from v_store then
  raise exception 'DEALS_RELATED_STORE_MISMATCH' using errcode='23514';
 end if;
 if tg_table_name='kinto_deals_v1_redemptions' then
  if not exists(
   select 1 from public.orders o
   where o.id=new.order_id
    and o.customer_id=new.customer_id::text
  ) then
   raise exception 'DEALS_REDEMPTION_CUSTOMER_ORDER_MISMATCH' using errcode='23514';
  end if;
  if not exists(
   select 1 from public.order_store_segments seg
   where seg.order_id=new.order_id and seg.store_id=v_store
  ) then
   raise exception 'DEALS_REDEMPTION_ORDER_STORE_MISMATCH' using errcode='23514';
  end if;
  if new.gift_product_id is not null and not exists(
   select 1 from public.local_products p
   where p.id=new.gift_product_id and p.store_id=v_store
  ) then
   raise exception 'DEALS_REDEMPTION_GIFT_STORE_MISMATCH' using errcode='23514';
  end if;
 end if;
 return new;
end;
$deals$;
commit;
