-- Disable only this assessment endpoint; preserve all requests/evidence and business functions.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_privacy_transaction_preview_admin_v1(text,uuid)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
