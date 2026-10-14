-- KINTO payment gate coordinated rollback (staging only).
-- IMPORTANT: deploy only with rollback of both dashboards to the previous direct-write code.
-- Never run as a standalone production action.
BEGIN;
DROP TRIGGER IF EXISTS trg_kinto_paid_transition_guard_v1 ON public.orders;
DROP FUNCTION IF EXISTS private.kinto_paid_transition_guard_v1();
REVOKE ALL ON FUNCTION public.kinto_approve_paid_order_v1(text,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.kinto_approve_paid_order_v1(text,text,uuid,text,jsonb);
-- Keep private audit history intact for forensic purposes.
-- Do not drop kinto_paid_approval_audit_v1.
COMMIT;
