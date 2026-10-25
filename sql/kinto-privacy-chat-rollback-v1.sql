-- Stop/drain chat worker first. Keep reviewed decisions/minimal deletion evidence.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_privacy_chat_review_v1(text,uuid,text,bigint,text,text,timestamptz,bigint),public.kinto_privacy_chat_erase_text_v1(text,uuid,bigint,bigint)FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS kinto_privacy_chat_cancel_v1 ON private.kinto_deletion_requests_v1;
COMMIT;
