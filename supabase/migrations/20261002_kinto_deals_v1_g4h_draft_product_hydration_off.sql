-- G4H: enrich verified vendor draft restore with its exact product metadata (not first-50 search).
-- No submission, publication, checkout, stock, invoice or browser table grants.
begin;
create or replace function public.kinto_deals_v1_vendor_drafts_g4(
 p_session_token text,p_campaign_id uuid default null,p_limit integer default 30)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_limit is null or p_limit not between 1 and 50 then
  raise exception 'DEALS_INVALID_DRAFT_LIMIT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id),'[]'::jsonb)
 into v_rows from (
  select c.id,c.title,c.description,c.kind,c.status,c.starts_at,c.ends_at,
   c.threshold_units,c.gift_product_id,c.gift_selected_options,
   c.max_uses_per_customer,c.max_units_per_customer,c.max_total_redemptions,
   c.terms_snapshot,c.created_at,c.updated_at,
   coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'product_name',p.product_name,
    'image_url',p.image_url,'barcode',p.barcode,'currency',p.currency,'base_price',p.base_price,
    'discount_price',p.discount_price,'is_out_of_stock',p.is_out_of_stock,'stock_quantity',p.stock_quantity)
    order by cp.created_at,cp.product_id)
    from public.kinto_deals_v1_products cp join public.local_products p
      on p.id=cp.product_id and p.store_id=c.store_id where cp.campaign_id=c.id),'[]'::jsonb) as products,
   (select jsonb_build_object('id',p.id,'product_name',p.product_name,
    'image_url',p.image_url,'barcode',p.barcode,'currency',p.currency,'base_price',p.base_price,
    'discount_price',p.discount_price,'is_out_of_stock',p.is_out_of_stock,'stock_quantity',p.stock_quantity)
    from public.local_products p where p.id=c.gift_product_id and p.store_id=c.store_id) as gift_product,
   coalesce((select jsonb_agg(cp.product_id order by cp.created_at,cp.product_id)
    from public.kinto_deals_v1_products cp where cp.campaign_id=c.id),'[]'::jsonb) as product_ids
  from public.kinto_deals_v1_campaigns c
  where c.store_id=v_store and c.status='draft'
   and not exists(select 1 from public.kinto_deals_v1_submissions s where s.campaign_id=c.id)
   and (p_campaign_id is null or c.id=p_campaign_id)
  order by c.updated_at desc,c.id limit p_limit
 ) q;
 return jsonb_build_object('items',v_rows,'store_id',v_store,'read_only',true);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_drafts_g4(text,uuid,integer)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_drafts_g4(text,uuid,integer)
 to anon,authenticated;
commit;
