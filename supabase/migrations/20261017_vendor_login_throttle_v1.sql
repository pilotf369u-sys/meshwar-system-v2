-- KINTO vendor login throttle (staged; do not execute on production before review).
-- Preserve the old credential verifier as a private-callable legacy implementation.
BEGIN;
ALTER FUNCTION public.vendor_login(text,text) RENAME TO vendor_login_legacy_verifier_v1;
REVOKE ALL ON FUNCTION public.vendor_login_legacy_verifier_v1(text,text) FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.vendor_login_attempts_v1 (
  identity_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.vendor_login_attempts_v1 FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.vendor_login(p_identity text, p_password text)
RETURNS TABLE(id uuid,store_name text,logo_url text,username text,phone text,country text,governorate text,store_type text,specialty text,default_currency text,commission_rate numeric,status text,exchange_rate numeric,exchange_base_currency text,exchange_target_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, private, extensions, pg_temp AS $$
DECLARE v_key text; v_rec private.vendor_login_attempts_v1%ROWTYPE; v_found integer;
BEGIN
 IF length(btrim(coalesce(p_identity,'')))=0 OR length(coalesce(p_password,''))=0 THEN RETURN; END IF;
 v_key:=encode(extensions.digest(lower(btrim(p_identity)),'sha256'),'hex');
 -- Serializes attempts per identity without holding a table lock.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));
 SELECT * INTO v_rec FROM private.vendor_login_attempts_v1 WHERE identity_hash=v_key FOR UPDATE;
 IF v_rec.blocked_until>clock_timestamp() THEN RETURN; END IF;
 RETURN QUERY SELECT * FROM public.vendor_login_legacy_verifier_v1(p_identity,p_password);
 GET DIAGNOSTICS v_found=ROW_COUNT;
 IF v_found>0 THEN
  DELETE FROM private.vendor_login_attempts_v1 WHERE identity_hash=v_key;
 ELSE
  INSERT INTO private.vendor_login_attempts_v1(identity_hash,failures,window_start,blocked_until,updated_at)
  VALUES(v_key,1,clock_timestamp(),NULL,clock_timestamp())
  ON CONFLICT(identity_hash) DO UPDATE SET
   failures=CASE WHEN private.vendor_login_attempts_v1.window_start < clock_timestamp()-interval '15 minutes' THEN 1 ELSE private.vendor_login_attempts_v1.failures+1 END,
   window_start=CASE WHEN private.vendor_login_attempts_v1.window_start < clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE private.vendor_login_attempts_v1.window_start END,
   blocked_until=CASE WHEN private.vendor_login_attempts_v1.window_start >= clock_timestamp()-interval '15 minutes' AND private.vendor_login_attempts_v1.failures+1>=8 THEN clock_timestamp()+interval '15 minutes' ELSE NULL END,
   updated_at=clock_timestamp();
 END IF;
END $$;
-- The secure-login endpoint must return errors instead of raising on authentication
-- failures: raising rolls back the throttle counter in the same transaction.
CREATE OR REPLACE FUNCTION public.vendor_login_session(p_identity text,p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE v_store_id uuid; v_store public.local_stores%rowtype; v_token text; v_expires_at timestamptz:=now()+interval '12 hours';
BEGIN
 IF btrim(coalesce(p_identity,''))='' OR coalesce(p_password,'')='' THEN
  RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS');
 END IF;
 SELECT authenticated_store.id INTO v_store_id
 FROM public.vendor_login(btrim(p_identity),p_password) authenticated_store LIMIT 1;
 IF v_store_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS_OR_RATE_LIMIT'); END IF;
 SELECT * INTO v_store FROM public.local_stores WHERE id=v_store_id AND lower(btrim(coalesce(status,'')))='active' LIMIT 1;
 IF v_store.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS'); END IF;
 DELETE FROM public.vendor_sessions WHERE expires_at<=now() OR revoked_at IS NOT NULL;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.vendor_sessions(store_id,token_hash,expires_at)
 VALUES(v_store.id,extensions.digest(v_token,'sha256'),v_expires_at);
 RETURN jsonb_build_object('session_token',v_token,'expires_at',v_expires_at,'store',
 jsonb_build_object('id',v_store.id,'store_name',v_store.store_name,'logo_url',v_store.logo_url,'username',v_store.username,
 'phone',v_store.phone,'country',v_store.country,'governorate',v_store.governorate,'store_type',v_store.store_type,
 'specialty',v_store.specialty,'default_currency',v_store.default_currency,'commission_rate',v_store.commission_rate,
 'status',v_store.status,'exchange_rate',v_store.exchange_rate,'exchange_base_currency',v_store.exchange_base_currency,
 'exchange_target_currency',v_store.exchange_target_currency));
END $$;
REVOKE ALL ON FUNCTION public.vendor_login(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_login(text,text) TO anon, authenticated, service_role;
COMMIT;
