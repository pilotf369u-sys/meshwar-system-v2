-- Disable new entry points while retaining reviewed identity records for invoices.
-- Do NOT drop the private retained table: rollback cannot recreate deleted profiles.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_privacy_invoice_preserve_v1(text,uuid,uuid),public.kinto_privacy_invoice_read_v1(text,text,uuid)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
