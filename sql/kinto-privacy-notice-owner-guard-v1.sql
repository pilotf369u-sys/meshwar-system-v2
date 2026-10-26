-- Source-only prerequisite for a future atomic finalizer. Not deployed.
-- Does not remove accounts, notices or recipients. Existing read_at updates bypass it.
BEGIN;
CREATE FUNCTION private.kinto_privacy_notice_owner_guard_v1()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp
SET lock_timeout='500ms' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id THEN RETURN NEW;END IF;
 -- Pin the exact customer row until transaction end. A committed deletion makes
 -- this check fail rather than inserting a new orphan recipient.
 PERFORM 1 FROM public.customers c WHERE c.id::text=NEW.customer_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOTICE_CUSTOMER_NOT_AVAILABLE';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_notice_owner_guard_v1()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER kinto_privacy_notice_owner_guard_v1
BEFORE INSERT OR UPDATE OF customer_id ON public.kinto_customer_admin_notice_recipients
FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_notice_owner_guard_v1();
COMMIT;
