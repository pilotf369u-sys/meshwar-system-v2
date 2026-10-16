-- Combined launch controls: execute this file as one transaction.
BEGIN;

-- Additive session controls. Install before the matching frontend; no legacy permissions removed here.

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

-- Additive companion to store controls: categories, currencies, legacy reads and private attachment authorization.

CREATE OR REPLACE FUNCTION public.kinto_category_write_session_v1(p_session_token text,p_action text,p_id uuid,p_patch jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE sid uuid:=private.require_vendor_session(p_session_token); old_row public.store_categories%ROWTYPE; next_row public.store_categories%ROWTYPE;
BEGIN
 IF p_action NOT IN ('insert','update','delete') OR p_action IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(ARRAY['store_id','parent_id','name','slug','sort_order','is_visible','updated_at'])) THEN RAISE EXCEPTION 'CATEGORY_PATCH_DENIED'; END IF;
 IF p_patch ? 'store_id' AND p_patch->>'store_id' IS DISTINCT FROM sid::text THEN RAISE EXCEPTION 'CATEGORY_STORE_DENIED'; END IF;
 IF p_action<>'insert' THEN SELECT * INTO old_row FROM public.store_categories WHERE id=p_id AND store_id=sid FOR UPDATE;IF NOT FOUND THEN RETURN '[]';END IF; END IF;
 IF p_action='delete' THEN DELETE FROM public.store_categories WHERE id=old_row.id AND store_id=sid RETURNING * INTO next_row;RETURN jsonb_build_array(to_jsonb(next_row)); END IF;
 next_row:=jsonb_populate_record(old_row,p_patch||jsonb_build_object('store_id',sid));
 IF coalesce(trim(next_row.name),'')='' OR coalesce(trim(next_row.slug),'')='' OR length(next_row.name)>200 OR length(next_row.slug)>200 THEN RAISE EXCEPTION 'CATEGORY_NAME_INVALID'; END IF;
 IF next_row.parent_id IS NOT NULL AND (next_row.parent_id=p_id OR NOT EXISTS(SELECT FROM public.store_categories WHERE id=next_row.parent_id AND store_id=sid AND parent_id IS NULL)
 OR EXISTS(SELECT FROM public.store_categories WHERE parent_id=p_id)) THEN RAISE EXCEPTION 'CATEGORY_PARENT_INVALID'; END IF;
 IF p_action='insert' THEN
 INSERT INTO public.store_categories(store_id,parent_id,name,slug,sort_order,is_visible) VALUES(sid,next_row.parent_id,next_row.name,next_row.slug,coalesce(next_row.sort_order,0),coalesce(next_row.is_visible,true)) RETURNING * INTO next_row;
 ELSE UPDATE public.store_categories SET parent_id=next_row.parent_id,name=next_row.name,slug=next_row.slug,sort_order=next_row.sort_order,is_visible=next_row.is_visible WHERE id=old_row.id AND store_id=sid RETURNING * INTO next_row; END IF;
 RETURN jsonb_build_array(to_jsonb(next_row));
END $$;
REVOKE ALL ON FUNCTION public.kinto_category_write_session_v1(text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_category_write_session_v1(text,text,uuid,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.kinto_currency_write_session_v1(p_session_token text,p_action text,p_id bigint,p_patch jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE r public.currencies%ROWTYPE;
BEGIN
 PERFORM private.kinto_staff_actor_v1('admin',p_session_token);
 IF p_action NOT IN ('insert','delete') OR p_action IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
 OR EXISTS(SELECT FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(ARRAY['name','rate'])) THEN RAISE EXCEPTION 'CURRENCY_ACTION_DENIED'; END IF;
 IF p_action='delete' THEN DELETE FROM public.currencies WHERE id=p_id RETURNING * INTO r;IF NOT FOUND THEN RETURN '[]'; END IF;
 ELSE
 IF coalesce(trim(p_patch->>'name'),'')='' OR length(p_patch->>'name')>100 OR p_patch->>'rate' IS NULL OR (p_patch->>'rate')::numeric<=0 OR p_patch->>'rate' IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'CURRENCY_RATE_INVALID'; END IF;
 INSERT INTO public.currencies(name,rate) VALUES(trim(p_patch->>'name'),(p_patch->>'rate')::numeric) RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_array(to_jsonb(r));
END $$;
REVOKE ALL ON FUNCTION public.kinto_currency_write_session_v1(text,text,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_currency_write_session_v1(text,text,bigint,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION private.kinto_legacy_store_scope_v1(store_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE h jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;sid uuid; a jsonb;
BEGIN
 IF coalesce(h->>'x-kinto-session','')='' THEN RETURN false; END IF;
 IF h->>'x-kinto-role'='admin' THEN a:=private.kinto_request_actor_v1();RETURN a->>'role'='admin'; END IF;
 IF h->>'x-kinto-role'='vendor' THEN
 SELECT s.store_id INTO sid FROM public.vendor_sessions s JOIN public.local_stores ls ON ls.id=s.store_id
 WHERE s.token_hash=extensions.digest(h->>'x-kinto-session','sha256') AND s.expires_at>now() AND s.revoked_at IS NULL AND ls.status='active' AND coalesce(ls.is_active,true);
 RETURN coalesce(sid::text=store_id,false);END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.kinto_legacy_store_scope_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.kinto_legacy_store_scope_v1(text) TO anon,authenticated;
CREATE TABLE IF NOT EXISTS private.kinto_attachment_tickets_v1(path text PRIMARY KEY,actor_role text NOT NULL,actor_id text NOT NULL,session_hash bytea NOT NULL,target_id text NOT NULL,purpose text NOT NULL,mime_type text NOT NULL,byte_size integer NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE private.kinto_attachment_tickets_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_attachment_tickets_v1 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.kinto_attachment_actor_v1(p_role text,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE a jsonb;c jsonb;cid uuid;permissions jsonb;
BEGIN
 IF p_role='customer' THEN cid:=private.require_customer_review_session(p_token);SELECT to_jsonb(x) INTO c FROM public.customers x WHERE id=cid;IF c IS NULL OR lower(coalesce(c->>'is_active','true')) IN ('false','0') OR lower(coalesce(c->>'active','true')) IN ('false','0') OR lower(coalesce(c->>'disabled','false')) IN ('true','1') OR lower(coalesce(c->>'status','active')) IN ('inactive','disabled','blocked','suspended','معطل','موقوف') THEN RAISE EXCEPTION 'ATTACHMENT_ACCOUNT_DISABLED';END IF;RETURN jsonb_build_object('role','customer','id',cid::text);END IF;
 IF p_role NOT IN ('admin','employee','branch','courier') OR p_role IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ROLE_DENIED'; END IF;
 a:=private.kinto_staff_actor_v1(p_role,p_token);permissions:=a->'permissions';IF jsonb_typeof(permissions)='string' THEN permissions:=(permissions#>>'{}')::jsonb;END IF;IF p_role='employee' AND permissions->'orders'='false'::jsonb AND permissions->'customers'='false'::jsonb THEN RAISE EXCEPTION 'ATTACHMENT_PERMISSION_DENIED';END IF;
 IF p_role='courier' THEN SELECT to_jsonb(x) INTO c FROM public.couriers x WHERE x.id::text=a->>'id';a:=a||jsonb_build_object('courier_uuid',c->>'courier_uuid');END IF;
 RETURN a||jsonb_build_object('role',p_role,'permissions',permissions);
END $$;
REVOKE ALL ON FUNCTION private.kinto_attachment_actor_v1(text,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.kinto_attachment_ticket_session_v1(p_role text,p_session_token text,p_purpose text,p_target_id text,p_mime_type text,p_byte_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE a jsonb:=private.kinto_attachment_actor_v1(p_role,p_session_token);o jsonb;path text;ext text;
BEGIN
 IF p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 15728640 OR p_mime_type IS NULL OR length(p_mime_type)>100 OR p_mime_type NOT IN ('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/octet-stream','video/mp4','audio/mpeg','audio/ogg','audio/webm','video/webm') THEN RAISE EXCEPTION 'ATTACHMENT_FILE_INVALID'; END IF;
 IF p_purpose='chat' THEN
  IF (p_role='customer' AND p_target_id IS DISTINCT FROM a->>'id') OR p_role NOT IN ('customer','admin','employee') OR NOT EXISTS(SELECT FROM public.customers WHERE id::text=p_target_id) THEN RAISE EXCEPTION 'ATTACHMENT_CHAT_SCOPE_DENIED'; END IF;
 ELSIF p_purpose IN ('parcel','proof') THEN
  SELECT to_jsonb(x) INTO o FROM public.orders x WHERE id::text=p_target_id;
  IF (p_role='employee' AND (a->'permissions'->'orders'='false'::jsonb OR a->'permissions'->'manage_orders'='false'::jsonb)) OR o IS NULL OR NOT private.kinto_order_visible_v1(o,a) OR (p_purpose='parcel' AND (p_role NOT IN ('admin','employee') OR o->>'status' NOT IN ('مخزن شركة','تجهيز شحن'))) OR (p_purpose='proof' AND p_role<>'courier') OR p_mime_type NOT LIKE 'image/%' THEN RAISE EXCEPTION 'ATTACHMENT_ORDER_SCOPE_DENIED'; END IF;
 ELSE RAISE EXCEPTION 'ATTACHMENT_PURPOSE_DENIED';END IF;
 ext:=CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'image/gif' THEN 'gif' WHEN 'application/pdf' THEN 'pdf' WHEN 'text/plain' THEN 'txt' ELSE 'bin' END;
 path:=p_role||'/'||(a->>'id')||'/'||gen_random_uuid()::text||'.'||ext;
 INSERT INTO private.kinto_attachment_tickets_v1 VALUES(path,p_role,a->>'id',extensions.digest(p_session_token,'sha256'),p_target_id,p_purpose,p_mime_type,p_byte_size,now()+interval '15 minutes');
 RETURN jsonb_build_object('bucket','chat-attachments','path',path,'mime_type',p_mime_type);
END $$;
REVOKE ALL ON FUNCTION public.kinto_attachment_ticket_session_v1(text,text,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_attachment_ticket_session_v1(text,text,text,text,text,integer) TO anon,authenticated;
CREATE OR REPLACE FUNCTION private.kinto_attachment_upload_allowed_v1(b text,n text,m jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE t private.kinto_attachment_tickets_v1%ROWTYPE;session_table text;actor_col text;valid boolean;account_table text;account jsonb;
BEGIN
 IF b<>'chat-attachments' THEN RETURN false;END IF;
 SELECT * INTO t FROM private.kinto_attachment_tickets_v1 WHERE path=n AND expires_at>now();
 IF NOT FOUND OR t.mime_type IS DISTINCT FROM m->>'mimetype' OR coalesce(m->>'size','')!~'^[0-9]{1,8}$' OR (m->>'size')::integer<>t.byte_size THEN RETURN false;END IF;
 session_table:=CASE t.actor_role WHEN 'customer' THEN 'customer_review_sessions' WHEN 'admin' THEN 'admin_sessions_v147' WHEN 'employee' THEN 'employee_sessions_v143' WHEN 'courier' THEN 'courier_sessions_v149' END;
 IF session_table IS NULL THEN RETURN false;END IF;
 actor_col:=t.actor_role||'_id';
 EXECUTE format('SELECT EXISTS(SELECT FROM public.%I WHERE %I::text=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>now())',session_table,actor_col) INTO valid USING t.actor_id,t.session_hash;
 IF NOT valid THEN RETURN false;END IF;
 account_table:=CASE t.actor_role WHEN 'customer' THEN 'customers' WHEN 'admin' THEN 'employees' WHEN 'employee' THEN 'employees' WHEN 'courier' THEN 'couriers' END;
 EXECUTE format('SELECT to_jsonb(a) FROM public.%I a WHERE id::text=$1',account_table) INTO account USING t.actor_id;
 RETURN account IS NOT NULL AND lower(coalesce(account->>'is_active','true')) NOT IN ('false','0') AND lower(coalesce(account->>'active','true')) NOT IN ('false','0') AND lower(coalesce(account->>'disabled','false')) NOT IN ('true','1')
 AND (t.actor_role NOT IN ('admin','employee') OR (t.actor_role='admin' AND lower(coalesce(account->>'role','')) IN ('admin','أدمن','ادمن')) OR (t.actor_role='employee' AND lower(coalesce(account->>'role','')) IN ('employee','موظف'))) AND lower(coalesce(account->>'status','active')) NOT IN ('inactive','disabled','blocked','suspended','معطل','موقوف');
END $$;
REVOKE ALL ON FUNCTION private.kinto_attachment_upload_allowed_v1(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.kinto_attachment_upload_allowed_v1(text,text,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.kinto_attachment_read_session_v1(p_role text,p_session_token text,p_paths jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE a jsonb:=private.kinto_attachment_actor_v1(p_role,p_session_token);p text;u text;allowed jsonb:='[]';
BEGIN
 IF jsonb_typeof(p_paths) IS DISTINCT FROM 'array' OR jsonb_array_length(p_paths)>100 THEN RAISE EXCEPTION 'ATTACHMENT_PATHS_INVALID'; END IF;
 FOR p IN SELECT jsonb_array_elements_text(p_paths) LOOP
  IF length(p)>1000 OR p LIKE '%..%' OR p LIKE '/%' THEN CONTINUE;END IF;
  u:='https://hsmmbloouskqdnptiiad.supabase.co/storage/v1/object/public/chat-attachments/'||p;
  IF EXISTS(SELECT FROM private.kinto_attachment_tickets_v1 t WHERE t.path=p AND t.actor_role=p_role AND t.actor_id=a->>'id')
  OR EXISTS(SELECT FROM public.messages m WHERE to_jsonb(m)->>'file_url'=u AND (p_role IN ('admin','employee') OR (p_role='customer' AND to_jsonb(m)->>'customer_id'=a->>'id')))
  OR EXISTS(SELECT FROM public.orders o WHERE private.kinto_order_visible_v1(to_jsonb(o),a) AND NOT coalesce(p_role='employee' AND (a->'permissions'->'orders'='false'::jsonb OR a->'permissions'->'manage_orders'='false'::jsonb),false) AND (to_jsonb(o)->>'parcel_image_url'=u OR to_jsonb(o)->>'delivery_proof_url'=u OR to_jsonb(o)->>'pod_image_url'=u OR to_jsonb(o)->>'proof_of_delivery_url'=u OR private.v94_jsonb_object(to_jsonb(o.details))->>'pod_image_url'=u OR private.v94_jsonb_object(to_jsonb(o.details))->>'delivery_proof_url'=u OR private.v94_jsonb_object(to_jsonb(o.details))->>'proof_of_delivery_url'=u)) THEN allowed:=allowed||to_jsonb(p);END IF;
 END LOOP;
 RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION public.kinto_attachment_read_session_v1(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_attachment_read_session_v1(text,text,jsonb) TO anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION public.kinto_attachment_read_session_v1(text,text,jsonb) TO service_role';END IF;END $$;
NOTIFY pgrst,'reload schema';

COMMIT;
