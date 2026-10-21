-- Emergency rollback of the KINTO payment approval gate ONLY.
-- Requires controlled deployment coordination: restore original employee/admin UI first.
-- Retains the audit table for incident review.
BEGIN;
DROP TRIGGER IF EXISTS trg_kinto_paid_marker_guard_v1 ON public.orders;
DROP TRIGGER IF EXISTS trg_kinto_paid_transition_guard_v1 ON public.orders;
DROP TRIGGER IF EXISTS trg_kinto_paid_insert_guard_v1 ON public.orders;
DROP FUNCTION IF EXISTS private.kinto_paid_marker_guard_v1();
DROP FUNCTION IF EXISTS private.kinto_paid_transition_guard_v1();
DROP FUNCTION IF EXISTS public.kinto_approve_paid_order_v1(text,text,uuid,text,jsonb);
-- Audit table retained deliberately.
-- Permit table is not removed while transactions may be active.
COMMIT;
