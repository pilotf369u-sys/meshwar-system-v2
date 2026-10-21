-- Roll back the UI deployment too. Refuse to overwrite subsequent finance changes.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.kinto_coupon_finance_backup_v1 b JOIN public.order_store_segments s ON s.id::text=b.key
 WHERE b.kind='segment' AND s.commission_snapshot IS DISTINCT FROM b.after_value) THEN RAISE EXCEPTION 'ROLLBACK_REQUIRES_REVIEW: finance changed after installation'; END IF;
END $$;
DROP TRIGGER IF EXISTS trg_kinto_coupon_sync_finance_v1 ON public.orders;
DROP TRIGGER IF EXISTS trg_kinto_coupon_segment_finance_v1 ON public.order_store_segments;
UPDATE public.order_store_segments s SET commission_snapshot=b.before_value FROM private.kinto_coupon_finance_backup_v1 b WHERE b.kind='segment' AND b.key=s.id::text;
DO $$ DECLARE r record; BEGIN FOR r IN SELECT * FROM private.kinto_coupon_finance_backup_v1 WHERE kind='function' LOOP
 IF pg_get_functiondef(r.key::regprocedure) IS DISTINCT FROM (r.after_value#>>'{}') THEN RAISE EXCEPTION 'ROLLBACK_REQUIRES_REVIEW: RPC changed: %',r.key; END IF;
 EXECUTE r.before_value#>>'{}';
END LOOP; END $$;
DROP FUNCTION private.kinto_coupon_sync_finance_v1(),private.kinto_coupon_segment_finance_v1(),private.kinto_coupon_goods_v1(jsonb),private.kinto_coupon_amount_v1(text),private.kinto_coupon_currency_v1(text);
DROP TABLE private.kinto_coupon_finance_backup_v1;
COMMIT;
