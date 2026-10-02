-- G6: public customer-facing approved campaign catalog. Read only, fail closed while OFF.
begin;
create or replace function public.kinto_deals_v1_customer_catalog_g6(
 p_limit integer default 24
) returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_items jsonb;
begin
 if not coalesce((select enabled from public.kinto_deals_v1_flags
  where key='merchant_deals_enabled'),false) then
  return jsonb_build_object('enabled',false,'items','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.ends_at,q.id),'[]'::jsonb)
 into v_items from (
  select c.id,c.store_id,c.title,c.description,c.kind,c.starts_at,c.ends_at,
   c.threshold_units,c.max_total_redemptions,
   s.store_name,s.logo_url as store_logo_url,
   (select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.product_name,'image_url',p.image_url)
      order by p.product_name),'[]'::jsonb)
    from public.kinto_deals_v1_products cp
    join public.local_products p on p.id=cp.product_id
    where cp.campaign_id=c.id) as products,
   (select jsonb_build_object('id',p.id,'name',p.product_name,'image_url',p.image_url)
    from public.local_products p where p.id=c.gift_product_id) as gift,
   (select count(*)::integer from public.kinto_deals_v1_redemptions r
    where r.campaign_id=c.id and r.state in ('pending','confirmed')) as used_allocations
  from public.kinto_deals_v1_campaigns c
  join public.local_stores s on s.id=c.store_id
  where c.status='submitted'
   and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()
   and exists (
    select 1 from public.kinto_deals_v1_submissions sub
    join public.kinto_deals_v1_review_events ev
     on ev.submission_id=sub.id and ev.campaign_id=c.id
      and ev.store_id=c.store_id and ev.decision='approved'
    where sub.campaign_id=c.id and sub.review_state='acknowledged'
     and sub.id=(select sub2.id from public.kinto_deals_v1_submissions sub2
      where sub2.campaign_id=c.id order by sub2.submitted_at desc,sub2.id desc limit 1))
   and (c.max_total_redemptions is null or
    (select count(*) from public.kinto_deals_v1_redemptions r
     where r.campaign_id=c.id and r.state in ('pending','confirmed'))<c.max_total_redemptions)
  order by c.ends_at,c.id limit least(greatest(coalesce(p_limit,24),1),48)
 ) q;
 return jsonb_build_object('enabled',true,'items',v_items,'binding',false);
end;
$deals$;
revoke all on function public.kinto_deals_v1_customer_catalog_g6(integer)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_customer_catalog_g6(integer)
 to anon,authenticated;
commit;
