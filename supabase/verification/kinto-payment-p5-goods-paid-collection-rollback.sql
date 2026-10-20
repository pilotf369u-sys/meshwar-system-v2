-- Rollback only disables future P5 cart stamps. Existing order values remain intact.
-- The additional `payment_kind` field in the session-scoped payment-history JSON is
-- intentionally retained: it is backward-compatible and lets invoices classify
-- already-paid P5 cart orders without rewriting historical order rows.
begin;
drop trigger if exists trg_00_kinto_payment_p5_goods_paid_collection on public.orders;
drop function if exists private.kinto_payment_p5_stamp_goods_paid_collection_v1();
commit;
