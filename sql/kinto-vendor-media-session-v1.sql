-- Additive only. Production lockdown remains a separate owner-controlled stage.
BEGIN;
CREATE TABLE private.vendor_media_tickets_v1(
 object_name text PRIMARY KEY,store_id uuid NOT NULL,session_hash bytea NOT NULL,
 mime_type text NOT NULL,byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 15728640),
 expires_at timestamptz NOT NULL);
ALTER TABLE private.vendor_media_tickets_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.vendor_media_tickets_v1 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.vendor_create_media_upload_session_v1(
 p_session_token text,p_store_id uuid,p_purpose text,p_mime_type text,p_byte_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor uuid; mime text:=lower(trim(p_mime_type)); ext text; object_path text;
BEGIN
 actor:=private.require_vendor_session(p_session_token);
 IF actor IS DISTINCT FROM p_store_id THEN RAISE EXCEPTION 'VENDOR_STORE_MISMATCH' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM public.local_stores WHERE id=actor AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'VENDOR_STORE_INACTIVE' USING ERRCODE='42501'; END IF;
 ext:=CASE mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'image/gif' THEN 'gif' WHEN 'image/avif' THEN 'avif' WHEN 'image/bmp' THEN 'bmp' END;
 IF ext IS NULL THEN RAISE EXCEPTION 'اختر صورة JPG أو PNG أو WebP أو GIF أو AVIF أو BMP.' USING ERRCODE='22023'; END IF;
 IF p_byte_size IS NULL OR p_byte_size<1 OR p_byte_size>15728640 THEN RAISE EXCEPTION 'حجم الصورة يجب أن يكون أكبر من صفر ولا يتجاوز 15MB.' USING ERRCODE='22023'; END IF;
 IF p_purpose='product' THEN object_path:=actor::text||'/'||gen_random_uuid()::text||'.'||ext;
 ELSIF p_purpose IN ('banner','logo') THEN object_path:='promotions/'||actor::text||'/'||p_purpose||'-'||gen_random_uuid()::text||'.'||ext;
 ELSE RAISE EXCEPTION 'MEDIA_PURPOSE_INVALID' USING ERRCODE='22023'; END IF;
 DELETE FROM private.vendor_media_tickets_v1 WHERE expires_at<=now();
 INSERT INTO private.vendor_media_tickets_v1 VALUES(object_path,actor,extensions.digest(p_session_token,'sha256'),mime,p_byte_size,now()+interval '15 minutes');
 RETURN jsonb_build_object('bucket','product-images','path',object_path,'mime_type',mime,'max_bytes',15728640);
END $$;
REVOKE ALL ON FUNCTION public.vendor_create_media_upload_session_v1(text,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_create_media_upload_session_v1(text,uuid,text,text,integer) TO anon,authenticated;
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
 -- Multipart contentLength includes boundary overhead and must not equal the file byte count.
 -- The Storage service enforces file-size limits; compare the final size only when supplied.
 AND (p_metadata->>'size' IS NULL OR
      (p_metadata->>'size' ~ '^[0-9]{1,8}
 $$;
REVOKE ALL ON FUNCTION private.vendor_media_upload_allowed_v1(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vendor_media_upload_allowed_v1(text,text,jsonb) TO anon,authenticated;
COMMIT;
 AND (p_metadata->>'size')::numeric=t.byte_size)));
 $$;
REVOKE ALL ON FUNCTION private.vendor_media_upload_allowed_v1(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vendor_media_upload_allowed_v1(text,text,jsonb) TO anon,authenticated;
COMMIT;
