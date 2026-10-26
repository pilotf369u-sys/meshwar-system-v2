-- Source-only internal step. NOT a complete account eraser or production activation.
-- Apply only after base privacy migration; never invoke from a public/customer RPC.
BEGIN;
CREATE FUNCTION private.kinto_privacy_notice_cleanup_v1(p_request_id uuid,p_confirm_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE req private.kinto_deletion_requests_v1; n integer; rel regclass;
BEGIN
 SELECT * INTO req FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id FOR UPDATE;
 IF req.status IS DISTINCT FROM 'verified' OR req.verified_by IS NULL OR req.customer_id IS NULL
 OR req.customer_id IS DISTINCT FROM p_confirm_customer_id THEN
  RAISE EXCEPTION 'VERIFIED_EXACT_REQUEST_REQUIRED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.kinto_erasure_policy_v1 WHERE singleton AND enabled
 AND inventory_signature=private.kinto_erasure_signature_v1())THEN
  RAISE EXCEPTION 'ERASURE_POLICY_OR_INVENTORY_NOT_VERIFIED';
 END IF;
 rel:=to_regclass('public.kinto_customer_admin_notice_recipients');
 IF rel IS NULL THEN RAISE EXCEPTION 'NOTICE_SCHEMA_NOT_VERIFIED';END IF;
 -- Lock the customer before deleting recipient rows, matching the insert guard.
 -- Do not take an exclusive recipient-table lock: writers hold its table lock
 -- before their BEFORE trigger tries to pin this customer.
 PERFORM 1 FROM public.customers WHERE id=req.customer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_MISSING';END IF;
 IF (SELECT count(*)FROM pg_attribute WHERE attrelid=rel AND attnum>0 AND NOT attisdropped)<>3
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname='customer_id'AND atttypid='text'::regtype AND attnotnull)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname='notice_id'AND atttypid='uuid'::regtype AND attnotnull)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname='read_at'AND atttypid='timestamptz'::regtype)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE t.tgrelid=rel AND t.tgname='kinto_privacy_notice_owner_guard_v1'
 AND t.tgfoid=to_regprocedure('private.kinto_privacy_notice_owner_guard_v1()')
 AND t.tgtype=23 AND t.tgenabled='O' AND t.tgattr::text='2'
 AND md5(p.prosrc)='8d7446cb403201abb6518cf70141b211' AND p.prosecdef AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
 AND p.proconfig=ARRAY['search_path=pg_catalog, public, private, pg_temp','lock_timeout=500ms']::text[])
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal
 AND tgname<>'kinto_privacy_notice_owner_guard_v1')
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f'AND confrelid=rel)
 THEN RAISE EXCEPTION 'NOTICE_SCHEMA_NOT_VERIFIED';END IF;
 DELETE FROM public.kinto_customer_admin_notice_recipients WHERE customer_id=req.customer_id::text;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('recipient_links_removed',n,'account_deleted',false,
 'shared_notice_deleted',false,'writer_coordination_verified',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_notice_cleanup_v1(uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
