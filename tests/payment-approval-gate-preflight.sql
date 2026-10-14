-- Read-only deployment preflight for KINTO payment gate.
-- Run on a staging copy, NOT a substitute for live role-based integration tests.
SELECT 'required_session_validator' AS check_type, p.proname AS item
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname IN
 ('require_admin_session_v147','require_employee_session_v143')
UNION ALL
SELECT 'orders_column', column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
 AND column_name IN
 ('id','status','details','reference_order_no','delivery_payment_type','branch_id',
 'branch_name','delivery_agent_id','courier_id','total_price','currency',
 'rejection_reason','delivery_fee')
ORDER BY check_type,item;
-- Expected: two session validators, all 13 orders columns.
-- Test matrix before merging:
-- 1. anon direct orders.update({status:'تم التسديد'}) -> DENIED.
-- 2. customer/vendor/branch/courier token to approval RPC -> DENIED.
-- 3. missing/expired/revoked employee/admin token -> DENIED.
-- 4. valid employee/admin token + current order status -> succeeds once.
-- 5. stale expected status / repeat approval -> DENIED.
-- 6. forged items, stock lifecycle, campaign or vendor finance in details -> DENIED.
-- 7. paid transition with real stock/variants, campaigns and vendor segments -> unchanged behavior.
-- 8. non-payment order state updates -> unchanged behavior.
-- 9. audit log actor/order present only on successful approval.
-- 10. production rollout must deploy the UI and RPC together; rollback is coordinated.
