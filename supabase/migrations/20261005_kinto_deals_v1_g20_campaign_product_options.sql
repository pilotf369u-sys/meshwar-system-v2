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
commit;
