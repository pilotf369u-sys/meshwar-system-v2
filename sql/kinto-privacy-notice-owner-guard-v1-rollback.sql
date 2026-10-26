BEGIN;
DROP TRIGGER IF EXISTS kinto_privacy_notice_owner_guard_v1 ON public.kinto_customer_admin_notice_recipients;
DROP FUNCTION IF EXISTS private.kinto_privacy_notice_owner_guard_v1();
COMMIT;
