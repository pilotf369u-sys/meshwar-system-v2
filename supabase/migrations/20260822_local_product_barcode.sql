-- MESHWAR_LOCAL_PRODUCT_BARCODE_V1
-- Adds optional barcode support for vendor products.

alter table public.local_products
  add column if not exists barcode text null;

create index if not exists idx_local_products_barcode
  on public.local_products(barcode);

comment on column public.local_products.barcode is
  'Optional vendor product barcode used for scanner lookup and smart product search.';
