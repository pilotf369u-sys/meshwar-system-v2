-- G3E: read-only, verified ADMIN campaign detail. Feature remains OFF.
begin;
create or replace function public.kinto_deals_v1_admin_detail_g3(
 p_session_token text,p_submission_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_admin text; v_detail jsonb; v_products jsonb; v_gift jsonb;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then
  raise exception 'DEALS_ADMIN_SESSION_REQUIRED' using errcode='28000';
 end if;
 select jsonb_build_object(
  'submission_id',s.id,'campaign_id',c.id,'store_id',c.store_id,
  'store_name',st.store_name,'store_logo_url',st.logo_url,
  'title',s.title_snapshot,'description',c.description,
  'kind',c.kind,'status',c.status,'review_state',s.review_state,
  'revision',s.revision,'submitted_at',s.submitted_at,
  'starts_at',c.starts_at,'ends_at',c.ends_at,
  'threshold_units',c.threshold_units,'max_uses_per_customer',c.max_uses_per_customer,
  'max_units_per_customer',c.max_units_per_customer,
  'max_total_redemptions',c.max_total_redemptions,
  'terms_snapshot',c.terms_snapshot,'summary_snapshot',s.summary_snapshot,
  'gift_selected_options',c.gift_selected_options
 ) into v_detail
 from public.kinto_deals_v1_submissions s
 join public.kinto_deals_v1_campaigns c on c.id=s.campaign_id and c.store_id=s.store_id
 join public.local_stores st on st.id=c.store_id
 where s.id=p_submission_id;
 if v_detail is null then raise exception 'DEALS_SUBMISSION_NOT_FOUND' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'product_id',p.id,'name',p.product_name,'image_url',p.image_url,
  'barcode',p.barcode,'currency',p.currency,'base_price',p.base_price,
  'discount_price',p.discount_price,'is_out_of_stock',p.is_out_of_stock,
  'stock_quantity',p.stock_quantity
 ) order by p.product_name),'[]'::jsonb) into v_products
 from public.kinto_deals_v1_products cp
 join public.local_products p on p.id=cp.product_id
 where cp.campaign_id=(v_detail->>'campaign_id')::uuid
   and p.store_id=(v_detail->>'store_id')::uuid;
 select jsonb_build_object('product_id',p.id,'name',p.product_name,
  'image_url',p.image_url,'barcode',p.barcode,'currency',p.currency,
  'base_price',p.base_price,'discount_price',p.discount_price,
  'stock_quantity',p.stock_quantity) into v_gift
 from public.kinto_deals_v1_campaigns c
 join public.local_products p on p.id=c.gift_product_id and p.store_id=c.store_id
 where c.id=(v_detail->>'campaign_id')::uuid;
 return v_detail||jsonb_build_object('products',v_products,'gift',v_gift,
  'campaign_image_url',null,'image_note','Dedicated DEALS media not enabled yet');
end;
$deals$;
revoke all on function public.kinto_deals_v1_admin_detail_g3(text,uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_admin_detail_g3(text,uuid) to anon,authenticated;
commit;
