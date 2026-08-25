-- External Shipping Fee schema migration
-- Safe/idempotent: adds isolated columns to public.orders only.
-- Does NOT modify product price, total_price, delivery_fee, vendor finance, or P&L fields.

begin;

alter table public.orders
  add column if not exists external_shipping_fee numeric(14,2) not null default 0,
  add column if not exists external_shipping_currency varchar(12) not null default 'USD';

-- Existing rows remain financially unchanged.
update public.orders
set external_shipping_fee = 0
where external_shipping_fee is null;

update public.orders
set external_shipping_currency = coalesce(nullif(trim(currency), ''), 'USD')
where external_shipping_currency is null
   or trim(external_shipping_currency) = '';

-- Prevent negative external shipping values while allowing any non-negative fee.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_external_shipping_fee_nonnegative'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_external_shipping_fee_nonnegative
      check (external_shipping_fee >= 0);
  end if;
end $$;

comment on column public.orders.external_shipping_fee is
  'External shipping charge. Kept separate from product price/total_price and local delivery fee so vendor/P&L calculations remain product-price-only.';

comment on column public.orders.external_shipping_currency is
  'Currency for external_shipping_fee. UI should normally keep this aligned with the order currency.';

commit;

-- Verification queries (run after migration):
-- select column_name, data_type, column_default, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'orders'
--   and column_name in ('external_shipping_fee','external_shipping_currency')
-- order by column_name;
--
-- select id, order_code, total_price, currency, delivery_fee,
--        external_shipping_fee, external_shipping_currency
-- from public.orders
-- order by created_at desc
-- limit 10;
