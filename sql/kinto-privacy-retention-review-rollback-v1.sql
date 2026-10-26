-- Disable the new review entry point only. Preserve decisions and existing business rows.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_privacy_retention_review_v1(text,uuid,text,text,uuid,uuid,text,text,bigint,text,text[],timestamptz)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
