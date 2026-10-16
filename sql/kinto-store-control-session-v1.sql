-- Additive session controls. Install before the matching frontend; no legacy permissions removed here.
BEGIN;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
 WHERE attrelid='public.local_stores'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'password_hash';
 EXECUTE format('CREATE OR REPLACE VIEW public.kinto_local_stores_public_v1 WITH (security_invoker=true) AS SELECT %s FROM public.local_stores',cols);
END $$;
GRANT SELECT ON public.kinto_local_stores_public_v1 TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_store_operation_session_v1(p_role text,p_session_token text,p_operation text,p_args jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE actor jsonb; actor_id text; fn record; names text[]; types oid[]; i integer; declarations text:=''; calls text:=''; result jsonb; args jsonb:=p_args; n integer;
BEGIN
 IF p_role='admin' AND p_operation=ANY(ARRAY['admin_save_local_store','save_global_store','update_global_store','delete_global_store','save_site_content',
 'admin_list_product_reviews_v138','admin_get_review_image_v139','admin_delete_product_review_image_v152','admin_moderate_product_review_v138']) THEN
  actor:=private.kinto_staff_actor_v1('admin',p_session_token);actor_id:=actor->>'id';
 ELSIF p_role='vendor' AND p_operation=ANY(ARRAY['vendor_get_profit_margin','vendor_set_profit_margin','vendor_set_exchange_rate','vendor_get_operating_expenses',
 'vendor_add_operating_expense','vendor_get_financial_periods','vendor_submit_featured_request','vendor_list_featured_requests']) THEN
  actor_id:=private.require_vendor_session(p_session_token)::text;
 ELSE RAISE EXCEPTION 'STORE_OPERATION_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(args) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'STORE_OPERATION_ARGS_INVALID'; END IF;
 SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p_operation AND prokind='f';
 IF n<>1 THEN RAISE EXCEPTION 'STORE_OPERATION_SIGNATURE_DRIFT'; END IF;
 SELECT * INTO fn FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p_operation AND prokind='f';
 names:=fn.proargnames;types:=fn.proargtypes::oid[];
 IF EXISTS(SELECT FROM jsonb_object_keys(args) k WHERE NOT k=ANY(names)) THEN RAISE EXCEPTION 'STORE_OPERATION_ARGS_DENIED'; END IF;
 IF p_role='vendor' THEN
  IF args ? 'p_store_id' AND args->>'p_store_id' IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'STORE_OPERATION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  args:=args||jsonb_build_object('p_store_id',actor_id);
 ELSE args:=args||jsonb_build_object('p_admin_id',actor_id); END IF;
 IF p_operation='admin_save_local_store' THEN
  IF coalesce(args->>'p_password','')<>'' AND length(args->>'p_password')<8 THEN RAISE EXCEPTION 'STORE_PASSWORD_TOO_SHORT'; END IF;
  IF coalesce(args->>'p_store_id','')='' AND length(coalesce(args->>'p_password',''))<8 THEN RAISE EXCEPTION 'STORE_PASSWORD_REQUIRED'; END IF;
  IF args ? 'p_commission_rate' AND ((args->>'p_commission_rate')::numeric<0 OR (args->>'p_commission_rate')::numeric>=100 OR (args->>'p_commission_rate') IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'STORE_COMMISSION_INVALID'; END IF;
 END IF;
 IF p_operation='vendor_set_exchange_rate' AND (args->>'p_rate') IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'STORE_RATE_INVALID'; END IF;
 IF p_operation='vendor_set_profit_margin' AND (args->>'p_margin') IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'STORE_MARGIN_INVALID'; END IF;
 -- Function identifiers come only from the fixed allowlist; names/types come from pg_catalog, values stay bound JSON.
 FOR i IN 1..fn.pronargs LOOP
  IF args ? names[i] THEN
   declarations:=declarations||CASE WHEN declarations='' THEN '' ELSE ',' END||format('%I %s',names[i],format_type(types[array_lower(types,1)+i-1],NULL));
   calls:=calls||CASE WHEN calls='' THEN '' ELSE ',' END||format('%I=>a.%I',names[i],names[i]);
  ELSIF i<=fn.pronargs-fn.pronargdefaults THEN RAISE EXCEPTION 'STORE_OPERATION_ARG_REQUIRED: %',names[i]; END IF;
 END LOOP;
 IF fn.proretset THEN
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) FROM jsonb_to_record($1) AS a(%s) CROSS JOIN LATERAL public.%I(%s) x',declarations,p_operation,calls) INTO result USING args;
 ELSE EXECUTE format('SELECT to_jsonb(public.%I(%s)) FROM jsonb_to_record($1) AS a(%s)',p_operation,calls,declarations) INTO result USING args; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.kinto_store_operation_session_v1(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_store_operation_session_v1(text,text,text,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_admin_store_status_session_v1(p_session_token text,p_store_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
BEGIN
 PERFORM private.kinto_staff_actor_v1('admin',p_session_token);
 IF p_status IS NULL OR p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'STORE_STATUS_INVALID'; END IF;
 UPDATE public.local_stores SET status=p_status WHERE id=p_store_id;IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.kinto_admin_store_status_session_v1(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_admin_store_status_session_v1(text,uuid,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
