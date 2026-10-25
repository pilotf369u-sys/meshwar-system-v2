-- Restore the coordinated privacy frontend first. Keep every actual erasure receipt/evidence.
BEGIN;
-- Close the privacy mutation entry point before removing any cancellation guard.
-- Keep the external support-email request route available; restore grants only
-- with a reviewed coordinated privacy deployment, not as an isolated rollback.
REVOKE ALL ON FUNCTION public.kinto_deletion_request_v1(text,text,boolean)FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.kinto_deletion_progress_v1(text,uuid),public.kinto_deletion_progress_admin_v1(text,uuid)FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS kinto_privacy_progress_cancel_v1 ON private.kinto_deletion_requests_v1;
COMMIT;
