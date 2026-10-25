-- Source review only. Bounded, custom-admin + verified-request assessment.
-- No customer/order/payment/file mutations, no approval token or deletion authority.
BEGIN;
CREATE FUNCTION private.kinto_privacy_preview_object_v1(p_text text)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;BEGIN
 IF p_text IS NULL OR length(p_text)>65536 THEN RETURN NULL;END IF;
 result:=p_text::jsonb;IF jsonb_typeof(result)IS DISTINCT FROM 'object'THEN RETURN NULL;END IF;RETURN result;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END$$;
CREATE FUNCTION private.kinto_privacy_preview_relation_v1(p_relation text,p_columns jsonb)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce((SELECT c.relkind='r'
 AND has_table_privilege(current_user,c.oid,'SELECT')
 AND(NOT c.relrowsecurity OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND(rolsuper OR rolbypassrls))OR(NOT c.relforcerowsecurity AND pg_has_role(current_user,c.relowner,'USAGE')))
 AND NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=c.oid OR inhrelid=c.oid)
 AND NOT EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=c.oid)
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_columns)expected WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname=expected.key AND to_jsonb(format_type(a.atttypid,a.atttypmod))<@expected.value))
 FROM pg_class c WHERE c.oid=to_regclass(p_relation)),false);
$$;
CREATE FUNCTION private.kinto_privacy_transaction_preview_v1(p_customer_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE sections jsonb:='{}';entry jsonb;kind text;rel text;columns jsonb;ok boolean;predicate text;detail_column text;query text;BEGIN
 IF p_customer_id IS NULL THEN RAISE EXCEPTION 'VERIFIED_CUSTOMER_REQUIRED';END IF;
 FOREACH kind IN ARRAY ARRAY['orders','world_orders','payment_attempts']LOOP
  CASE kind
   WHEN 'orders'THEN rel:='public.orders';columns:='{"id":["uuid"],"customer_id":["uuid","text"],"details":["text","jsonb"]}';detail_column:='details';
   WHEN 'world_orders'THEN rel:='private.kinto_world_orders_v1';columns:='{"id":["uuid"],"customer_id":["uuid"],"request":["jsonb"]}';detail_column:='request';
   WHEN 'payment_attempts'THEN rel:='private.kinto_payment_attempts_p4';columns:='{"id":["uuid"],"customer_id":["text"],"status":["text"]}';detail_column:=NULL;
  END CASE;
  ok:=private.kinto_privacy_preview_relation_v1(rel,columns);
  IF NOT ok THEN sections:=sections||jsonb_build_object(kind,jsonb_build_object('available',false,'hold','SCHEMA_OR_VISIBILITY_UNVERIFIED'));CONTINUE;END IF;
  SELECT CASE WHEN atttypid='uuid'::regtype THEN 'customer_id=$1'ELSE 'lower(customer_id)=$1::text'END INTO predicate FROM pg_attribute WHERE attrelid=to_regclass(rel)AND attname='customer_id';
  IF detail_column IS NOT NULL THEN
   query:=format('WITH q AS MATERIALIZED(SELECT id,left(%I::text,65537)payload FROM %s WHERE %s ORDER BY id LIMIT 201),sample AS(SELECT *FROM q ORDER BY id LIMIT 200)SELECT jsonb_build_object(''available'',true,''sample_count'',count(*),''truncated'',(SELECT count(*)>200 FROM q),''unreadable_objects'',count(*)FILTER(WHERE private.kinto_privacy_preview_object_v1(payload)IS NULL),''review_required'',true)FROM sample',detail_column,rel,predicate);
  ELSE
   query:=format('WITH q AS MATERIALIZED(SELECT id,status FROM %s WHERE %s ORDER BY id LIMIT 201),sample AS(SELECT *FROM q ORDER BY id LIMIT 200)SELECT jsonb_build_object(''available'',true,''sample_count'',count(*),''truncated'',(SELECT count(*)>200 FROM q),''outcome_unresolved'',count(*)FILTER(WHERE status IS NULL OR status NOT IN(''succeeded'',''failed'',''cancelled'',''expired'')),''review_required'',true)FROM sample',rel,predicate);
  END IF;
  EXECUTE query INTO entry USING p_customer_id;sections:=sections||jsonb_build_object(kind,entry);
 END LOOP;
 -- Never infer segment ownership from customer_snapshot contact data.
 IF private.kinto_privacy_preview_relation_v1('public.orders','{"id":["uuid"],"customer_id":["uuid","text"]}')AND private.kinto_privacy_preview_relation_v1('public.order_store_segments','{"id":["uuid"],"order_id":["uuid"],"customer_snapshot":["jsonb"]}')THEN
  SELECT CASE WHEN atttypid='uuid'::regtype THEN 'o.customer_id=$1'ELSE 'lower(o.customer_id)=$1::text'END INTO predicate FROM pg_attribute WHERE attrelid='public.orders'::regclass AND attname='customer_id';
  EXECUTE format('WITH q AS MATERIALIZED(SELECT s.id,left(s.customer_snapshot::text,65537)payload FROM public.order_store_segments s JOIN public.orders o ON o.id=s.order_id WHERE %s ORDER BY s.id LIMIT 201),sample AS(SELECT *FROM q ORDER BY id LIMIT 200)SELECT jsonb_build_object(''available'',true,''sample_count'',count(*),''truncated'',(SELECT count(*)>200 FROM q),''snapshot_missing_or_empty'',count(*)FILTER(WHERE private.kinto_privacy_preview_object_v1(payload)IS NULL OR private.kinto_privacy_preview_object_v1(payload)=''{}''::jsonb),''invoice_dependency_review_required'',true)FROM sample',predicate)INTO entry USING p_customer_id;
  sections:=sections||jsonb_build_object('segments',entry);
 ELSE sections:=sections||jsonb_build_object('segments',jsonb_build_object('available',false,'hold','SCHEMA_OR_VISIBILITY_UNVERIFIED'));END IF;
 RETURN jsonb_build_object('format','KINTO_TRANSACTION_DB_PREVIEW_1','sections',sections,'deletion_authorized',false,'coverage_complete',false,'production_ready',false,'live_revalidation_required',true,'mandatory_holds',jsonb_build_array('OTHER_TABLES_NOT_COVERED','INVOICE_FALLBACK_NOT_QUALIFIED','TRIGGERS_AND_CONCURRENCY_NOT_QUALIFIED','MEDIA_AND_BACKUPS_NOT_QUALIFIED'));
END$$;
CREATE FUNCTION public.kinto_privacy_transaction_preview_admin_v1(p_session_token text,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' SET statement_timeout='5s' AS $$
DECLARE aid text:=private.require_admin_session_v147(p_session_token);cid uuid;BEGIN
 SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status='verified'AND verified_by IS NOT NULL;
 IF cid IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;
 RETURN private.kinto_privacy_transaction_preview_v1(cid);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_preview_object_v1(text),private.kinto_privacy_preview_relation_v1(text,jsonb),private.kinto_privacy_transaction_preview_v1(uuid),public.kinto_privacy_transaction_preview_admin_v1(text,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_transaction_preview_admin_v1(text,uuid)TO anon,authenticated,service_role;
COMMIT;
