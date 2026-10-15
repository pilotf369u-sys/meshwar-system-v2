-- KINTO order price protection: read-only production verification.
-- Run after installing the three guard migrations. No data changes.
SELECT tgname,
       tgenabled = 'O' AS enabled,
       pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND tgname IN (
    'trg_kinto_local_order_insert_gate_v1',
    'trg_kinto_local_independent_amount_guard_v1',
    'trg_kinto_global_link_no_local_promotion_v1'
  )
ORDER BY tgname;
-- Expect three rows, enabled = true.

SELECT
  count(*) FILTER (
    WHERE details::jsonb ->> 'checkout_contract' = 'independent_vendor_orders'
  ) AS independent_vendor_orders,
  count(*) FILTER (
    WHERE order_code LIKE 'MW-%' AND order_url ~* '^https?://'
  ) AS global_link_orders,
  count(*) AS total_orders
FROM public.orders;
-- Counts are observational only; do not modify orders.

SELECT
  has_table_privilege('anon','public.orders','INSERT') AS anon_can_insert,
  has_table_privilege('anon','public.orders','UPDATE') AS anon_can_update,
  has_table_privilege('authenticated','public.orders','UPDATE') AS authenticated_can_update;
-- NOTE: broad legacy UPDATE grants remain. The guards are deliberately
-- targeted to new local vendor orders, not a replacement for global-order
-- authorization or a complete RLS redesign.
