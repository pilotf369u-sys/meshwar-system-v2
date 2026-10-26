-- Review decisions only: no business-record mutation and no erasure authorization.
BEGIN;
CREATE TABLE private.kinto_privacy_retention_decisions_v1(
 request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),
 record_group text NOT NULL CHECK(record_group IN('orders','segments','world_orders','payment_attempts')),
 record_id uuid NOT NULL,content_hash text NOT NULL CHECK(content_hash~'^[0-9a-f]{64}$'),
 inventory_signature text NOT NULL CHECK(inventory_signature~'^[0-9a-f]{32}$'),
 reason text NOT NULL CHECK(reason IN('accounting','active_order','payment_resolution','dispute','invoice_dependency')),
 needed_fields text[] NOT NULL CHECK(cardinality(needed_fields) BETWEEN 1 AND 10),
 review_on timestamptz NOT NULL CHECK(isfinite(review_on)),reviewed_by uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,record_group,record_id)
);
ALTER TABLE private.kinto_privacy_retention_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_privacy_retention_decisions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.kinto_privacy_retention_source_v1(p_group text)RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE rel text;BEGIN
 rel:=CASE p_group WHEN 'orders'THEN 'public.orders'WHEN 'segments'THEN 'public.order_store_segments'WHEN 'world_orders'THEN 'private.kinto_world_orders_v1'WHEN 'payment_attempts'THEN 'private.kinto_payment_attempts_p4'END;
 IF rel IS NULL THEN RAISE EXCEPTION 'INVALID_RETENTION_GROUP';END IF;
 IF NOT private.kinto_privacy_preview_relation_v1(rel,CASE WHEN p_group='segments'THEN '{"id":["uuid"],"order_id":["uuid"]}'::jsonb ELSE '{"id":["uuid"],"customer_id":["uuid","text"]}'::jsonb END)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=f.conkey[1]WHERE f.conrelid=to_regclass(rel)AND f.contype='p'AND cardinality(f.conkey)=1 AND a.attname='id')THEN RAISE EXCEPTION 'RETENTION_RELATION_UNVERIFIED';END IF;
 IF p_group='segments'AND NOT private.kinto_privacy_preview_relation_v1('public.orders','{"id":["uuid"],"customer_id":["uuid","text"]}')THEN RAISE EXCEPTION 'RETENTION_RELATION_UNVERIFIED';END IF;
 RETURN rel;
END$$;
CREATE FUNCTION private.kinto_privacy_retention_row_v1(p_customer_id uuid,p_group text,p_record_id uuid,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE rel text:=private.kinto_privacy_retention_source_v1(p_group);result jsonb;q text;BEGIN
 IF p_group='segments'THEN
  q:='SELECT to_jsonb(r)||jsonb_build_object(''__parent_order'',to_jsonb(o)) FROM public.order_store_segments r JOIN public.orders o ON o.id=r.order_id WHERE r.id=$1 AND lower(o.customer_id::text)=$2';
  IF p_lock THEN q:=q||' FOR SHARE OF r,o';END IF;
 ELSE
  q:=format('SELECT to_jsonb(r) FROM %s r WHERE r.id=$1 AND lower(r.customer_id::text)=$2',rel::regclass);
  IF p_lock THEN q:=q||' FOR SHARE OF r';END IF;
 END IF;
 EXECUTE q INTO result USING p_record_id,p_customer_id::text;
 RETURN result;
END$$;
CREATE FUNCTION public.kinto_privacy_retention_review_v1(p_session_token text,p_request_id uuid,p_group text DEFAULT 'orders',p_action text DEFAULT 'list',p_record_id uuid DEFAULT NULL,p_after_id uuid DEFAULT NULL,p_expected_hash text DEFAULT NULL,p_expected_signature text DEFAULT NULL,p_expected_revision bigint DEFAULT NULL,p_reason text DEFAULT NULL,p_needed_fields text[] DEFAULT NULL,p_review_on timestamptz DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' SET statement_timeout='5s' AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;cid uuid;rel text;ids uuid[];rid uuid;payload jsonb;h text;signature text;d private.kinto_privacy_retention_decisions_v1;items jsonb:='[]';q text;fields text[];BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','retain')THEN RAISE EXCEPTION 'INVALID_RETENTION_ACTION';END IF;
 SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status='verified'AND verified_by IS NOT NULL FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;
 rel:=private.kinto_privacy_retention_source_v1(p_group);signature:=private.kinto_erasure_signature_v1();
 IF p_action='list'THEN
  q:=CASE WHEN p_group='segments'THEN 'SELECT r.id FROM public.order_store_segments r JOIN public.orders o ON o.id=r.order_id WHERE lower(o.customer_id::text)=$1'ELSE format('SELECT r.id FROM %s r WHERE lower(r.customer_id::text)=$1',rel::regclass)END;
  EXECUTE 'SELECT array_agg(id ORDER BY id)FROM('||q||' AND($2 IS NULL OR r.id>$2)ORDER BY r.id LIMIT 21)x'INTO ids USING cid::text,p_after_id;
  FOREACH rid IN ARRAY coalesce(ids[1:20],'{}'::uuid[])LOOP
   payload:=private.kinto_privacy_retention_row_v1(cid,p_group,rid);h:=NULL;
   IF payload IS NOT NULL AND octet_length(payload::text)<=65536 THEN h:=encode(digest(payload::text,'sha256'),'hex');END IF;
   SELECT *INTO d FROM private.kinto_privacy_retention_decisions_v1 WHERE request_id=p_request_id AND record_group=p_group AND record_id=rid;
   items:=items||jsonb_build_array(jsonb_build_object('record_id',rid,'reference',left(coalesce(payload#>>'{__parent_order,order_code}',payload->>'order_code',payload->>'reference_order_no',rid::text),80),'reviewable',h IS NOT NULL,'content_hash',h,'inventory_signature',signature,'decision_revision',coalesce(d.revision,0),'reason',d.reason,'needed_fields',d.needed_fields,'review_on',d.review_on,'decision_current',coalesce(d.content_hash=h AND d.inventory_signature=signature AND d.review_on>now(),false)));
  END LOOP;
  RETURN jsonb_build_object('items',items,'has_more',coalesce(cardinality(ids)>20,false),'deletion_authorized',false,'coverage_complete',false,'account_deleted',false);
 END IF;
 payload:=private.kinto_privacy_retention_row_v1(cid,p_group,p_record_id,true);
 IF payload IS NULL THEN RAISE EXCEPTION 'OWNED_RETENTION_RECORD_REQUIRED';END IF;
 IF octet_length(payload::text)>65536 THEN RAISE EXCEPTION 'RETENTION_CONTEXT_TOO_LARGE';END IF;
 h:=encode(digest(payload::text,'sha256'),'hex');
 IF p_expected_hash IS DISTINCT FROM h OR p_expected_signature IS DISTINCT FROM signature THEN RAISE EXCEPTION 'RETENTION_CONTEXT_CHANGED';END IF;
 SELECT *INTO d FROM private.kinto_privacy_retention_decisions_v1 WHERE request_id=p_request_id AND record_group=p_group AND record_id=p_record_id FOR UPDATE;
 IF p_expected_revision IS DISTINCT FROM coalesce(d.revision,0)THEN RAISE EXCEPTION 'RETENTION_DECISION_CHANGED';END IF;
 IF p_reason IS NULL OR p_reason NOT IN('accounting','active_order','payment_resolution','dispute','invoice_dependency')THEN RAISE EXCEPTION 'RETENTION_REASON_REQUIRED';END IF;
 IF p_needed_fields IS NULL OR cardinality(p_needed_fields)NOT BETWEEN 1 AND 10 OR array_position(p_needed_fields,NULL)IS NOT NULL OR NOT(p_needed_fields<@ARRAY['reference','date','items','amount_currency','payment_reference','contact_name','contact_phone','delivery_address','invoice_identity'])THEN RAISE EXCEPTION 'RETENTION_FIELDS_REQUIRED';END IF;
 SELECT array_agg(DISTINCT f ORDER BY f)INTO fields FROM unnest(p_needed_fields)f;
 IF cardinality(fields)<>cardinality(p_needed_fields)THEN RAISE EXCEPTION 'RETENTION_FIELDS_REQUIRED';END IF;
 IF p_review_on IS NULL OR NOT isfinite(p_review_on)OR p_review_on<=now()OR p_review_on>now()+interval '366 days'THEN RAISE EXCEPTION 'RETENTION_REVIEW_DATE_REQUIRED';END IF;
 INSERT INTO private.kinto_privacy_retention_decisions_v1(request_id,record_group,record_id,content_hash,inventory_signature,reason,needed_fields,review_on,reviewed_by)
 VALUES(p_request_id,p_group,p_record_id,h,signature,p_reason,fields,p_review_on,aid)
 ON CONFLICT(request_id,record_group,record_id)DO UPDATE SET content_hash=excluded.content_hash,inventory_signature=excluded.inventory_signature,reason=excluded.reason,needed_fields=excluded.needed_fields,review_on=excluded.review_on,reviewed_by=excluded.reviewed_by,revision=private.kinto_privacy_retention_decisions_v1.revision+1,updated_at=now();
 INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(p_request_id,'transaction_retention_reviewed',aid);
 RETURN jsonb_build_object('reviewed',true,'deletion_authorized',false,'coverage_complete',false,'account_deleted',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_retention_source_v1(text),private.kinto_privacy_retention_row_v1(uuid,text,uuid,boolean),public.kinto_privacy_retention_review_v1(text,uuid,text,text,uuid,uuid,text,text,bigint,text,text[],timestamptz)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_retention_review_v1(text,uuid,text,text,uuid,uuid,text,text,bigint,text,text[],timestamptz)TO anon,authenticated;
COMMIT;
