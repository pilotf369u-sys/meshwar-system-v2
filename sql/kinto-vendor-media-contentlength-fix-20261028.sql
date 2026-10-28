-- Deploy only after isolated tests and owner-approved maintenance. Changes a single Storage authorization function.
-- No table, product, order, auth or existing object mutation. Requires the original vendor-media session schema.
BEGIN;
CREATE OR REPLACE FUNCTION private.vendor_media_upload_allowed_v1(p_bucket text,p_name text,p_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT p_bucket='product-images' AND EXISTS(
 SELECT FROM private.vendor_media_tickets_v1 t
 JOIN public.vendor_sessions s ON s.token_hash=t.session_hash AND s.store_id=t.store_id
 JOIN public.local_stores ls ON ls.id=t.store_id
 WHERE t.object_name=p_name AND t.expires_at>now()
 AND s.expires_at>now() AND s.revoked_at IS NULL
 AND lower(trim(coalesce(ls.status,'')))='active' AND coalesce(ls.is_active,true)
 AND t.mime_type=lower(coalesce(p_metadata->>'mimetype',''))
 -- On multipart uploads, contentLength includes framing bytes; rely on Storage's bucket size validation.
 -- If final file size is supplied, still reject mismatches with the authorized upload ticket.
 AND (p_metadata->>'size' IS NULL OR
      (p_metadata->>'size' ~ '^[0-9]{1,8}$' AND (p_metadata->>'size')::numeric=t.byte_size)));
$$;
COMMIT;
