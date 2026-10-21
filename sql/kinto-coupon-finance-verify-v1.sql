-- Read only: installed functions, corrected pending snapshots and historical exclusions.
SELECT p.proname,position('private.kinto_coupon_goods_v1(' IN pg_get_functiondef(p.oid))>0 coupon_aware
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
AND p.proname IN ('kinto_request_settlements_session_v1','kinto_decide_settlement_session_v1','kinto_cash_settle_courier_session_v1');
SELECT o.order_code,s.vendor_payment_status,s.commission_snapshot->>'original_goods_amount' original_goods,
 s.commission_snapshot->>'vendor_coupon_discount' vendor_coupon,s.commission_snapshot->>'kinto_coupon_discount' kinto_coupon,
 s.commission_snapshot->>'gross_amount' commission_basis,s.commission_snapshot->>'commission_amount' commission,
 s.commission_snapshot->>'other_deductions' other_deductions,s.commission_snapshot->>'net_amount' vendor_net,
 private.kinto_coupon_goods_v1(to_jsonb(o)) customer_goods
FROM public.order_store_segments s JOIN public.orders o ON o.id=s.order_id
WHERE s.commission_snapshot->>'coupon_finance_version'='v1' ORDER BY o.created_at DESC LIMIT 50;
