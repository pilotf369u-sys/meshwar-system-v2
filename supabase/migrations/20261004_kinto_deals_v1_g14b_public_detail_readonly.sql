-- G14-B: publication-gated read-only details. No cart, order, redemption or stock mutation.
begin;
create or replace function public.kinto_deals_v1_public_detail_g14(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=public,private,pg_temp as $g14$
declare v_campaign record;v_products jsonb;v_gift jsonb;
begin
 if p_campaign_id is null then return null;end if;
 -- Use the exact live publication gate (review approval, publication, dates, store).
 select c.id,c.store_id,c.title,c.description,c.kind,c.starts_at,c.ends_at,
        c.threshold_units,c.max_uses_per_customer,c.max_units_per_customer,
        c.max_total_redemptions,c.terms_snapshot,c.gift_product_id
 into v_campaign
 from public.kinto_deals_v1_campaigns c
 where c.id=p_campaign_id
   and exists(select 1 from public.kinto_deals_v1_public_feed_g7(c.store_id) f
              where f.campaign_id=c.id);
 if not found then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'name',p.product_name,'image_url',p.image_url,
  'currency',p.currency,'price',coalesce(p.discount_price,p.base_price),
  'is_out_of_stock',p.is_out_of_stock
 ) order by cp.created_at,cp.product_id),'[]'::jsonb) into v_products
 from public.kinto_deals_v1_products cp
 join public.local_products p on p.id=cp.product_id and p.store_id=v_campaign.store_id
 where cp.campaign_id=v_campaign.id;
 select jsonb_build_object('id',p.id,'name',p.product_name,'image_url',p.image_url)
 into v_gift from public.local_products p
 where p.id=v_campaign.gift_product_id and p.store_id=v_campaign.store_id;
 return jsonb_build_object(
  'campaign_id',v_campaign.id,'store_id',v_campaign.store_id,
  'title',v_campaign.title,'description',v_campaign.description,
  'kind',v_campaign.kind,'starts_at',v_campaign.starts_at,'ends_at',v_campaign.ends_at,
  'threshold_units',v_campaign.threshold_units,
  'max_uses_per_customer',v_campaign.max_uses_per_customer,
  'max_units_per_customer',v_campaign.max_units_per_customer,
  'max_total_redemptions',v_campaign.max_total_redemptions,
  'terms_snapshot',v_campaign.terms_snapshot,
  'products',v_products,'gift',v_gift,'read_only',true);
end;$g14$;
revoke all on function public.kinto_deals_v1_public_detail_g14(uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_public_detail_g14(uuid) to anon,authenticated,service_role;
commit;
