-- Stop/drain review worker first. Keep reviewed decisions and minimal evidence.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_privacy_review_record_v1(text,uuid,text,uuid,text,text,timestamptz,uuid),public.kinto_privacy_review_erase_v1(text,uuid,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS kinto_privacy_review_cancel_v1 ON private.kinto_deletion_requests_v1;
COMMIT;
