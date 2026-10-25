-- Restore the coordinated privacy frontend first. Keep every actual erasure receipt/evidence.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_deletion_progress_v1(text,uuid),public.kinto_deletion_progress_admin_v1(text,uuid)FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS kinto_privacy_progress_cancel_v1 ON private.kinto_deletion_requests_v1;
COMMIT;
