-- MESHWAR_LOCAL_PRODUCT_SUBCATEGORY_PERSISTENCE_V1
-- Keeps category_id backward-compatible while persisting the explicit selected subcategory.

alter table public.local_products
  add column if not exists subcategory_id uuid null;

-- Add the FK only when store_categories exists and the constraint is not already present.
do $$
begin
  if to_regclass('public.store_categories') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'local_products_subcategory_id_fkey'
         and conrelid = 'public.local_products'::regclass
     ) then
    alter table public.local_products
      add constraint local_products_subcategory_id_fkey
      foreign key (subcategory_id)
      references public.store_categories(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_local_products_subcategory_id
  on public.local_products(subcategory_id);

comment on column public.local_products.subcategory_id is
  'Explicit child category selected by vendor; category_id remains the effective category for backward-compatible storefront filtering.';
