-- Additive stage: install before deploying dashboard.html. No existing ACL changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.customer_update_profile_session_v1(p_session_token text,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE customer_id uuid; profile jsonb; field text;
BEGIN
 customer_id:=private.require_customer_review_session(p_session_token);
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb THEN
  RAISE EXCEPTION 'CUSTOMER_PROFILE_PATCH_REQUIRED' USING ERRCODE='22023';
 END IF;
 FOR field IN SELECT jsonb_object_keys(p_patch) LOOP
  IF field NOT IN ('address','state','secondary_phone') THEN
   RAISE EXCEPTION 'CUSTOMER_PROFILE_FIELD_FORBIDDEN: %',field USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_patch->field) NOT IN ('string','null') THEN
   RAISE EXCEPTION 'CUSTOMER_PROFILE_VALUE_INVALID: %',field USING ERRCODE='22023';
  END IF;
  IF length(p_patch->>field)>(CASE WHEN field='address' THEN 4000 WHEN field='state' THEN 200 ELSE 100 END) THEN
   RAISE EXCEPTION 'CUSTOMER_PROFILE_VALUE_TOO_LONG: %',field USING ERRCODE='22023';
  END IF;
 END LOOP;
 UPDATE public.customers c SET
  address=CASE WHEN p_patch?'address' THEN coalesce(btrim(p_patch->>'address'),'') ELSE c.address END,
  state=CASE WHEN p_patch?'state' THEN nullif(btrim(p_patch->>'state'),'') ELSE c.state END,
  secondary_phone=CASE WHEN p_patch?'secondary_phone' THEN nullif(btrim(p_patch->>'secondary_phone'),'') ELSE c.secondary_phone END
 WHERE c.id=customer_id
 RETURNING jsonb_build_object('id',c.id,'address',c.address,'state',c.state,'secondary_phone',c.secondary_phone) INTO profile;
 IF profile IS NULL THEN RAISE EXCEPTION 'CUSTOMER_SESSION_INVALID'; END IF;
 RETURN jsonb_build_object('ok',true,'profile',profile);
END $$;
REVOKE ALL ON FUNCTION public.customer_update_profile_session_v1(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_update_profile_session_v1(text,jsonb) TO anon,authenticated;
COMMIT;
