-- G20: freeze merchant-selected variant options per campaign product.
-- Additive only; does not alter order status, stock deduction, shipping or invoice lifecycle.
begin;
alter table public.kinto_deals_v1_products
 add column if not exists selected_options jsonb not null default '{}'::jsonb;
alter table public.kinto_deals_v1_products
 drop constraint if exists kinto_deals_v1_products_selected_options_object_g20;
alter table public.kinto_deals_v1_products
 add constraint kinto_deals_v1_products_selected_options_object_g20
 check (jsonb_typeof(selected_options)='object' and length(selected_options::text)<=3000);
comment on column public.kinto_deals_v1_products.selected_options is
 'G20 merchant-frozen color/size/volume selection for this campaign product; customer cannot override it.';

-- Save product ids and their frozen options in the same transaction as the existing G4 draft save.
create or replace function public.kinto_deals_v1_apply_product_options_g20(
 p_campaign_id uuid,p_product_options jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $g20$
begin
 if jsonb_typeof(coalesce(p_product_options,'{}'::jsonb))<>'object' then raise exception 'DEALS_PRODUCT_OPTIONS_INVALID' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(coalesce(p_product_options,'{}'::jsonb)) e where jsonb_typeof(e.value)<>'object' or length(e.value::text)>3000) then raise exception 'DEALS_PRODUCT_OPTIONS_INVALID' using errcode='22023'; end if;
 update public.kinto_deals_v1_products cp set selected_options=coalesce(p_product_options->cp.product_id::text,'{}'::jsonb) where cp.campaign_id=p_campaign_id;
end;$g20$;
commit;
