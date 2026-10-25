-- Additive privacy module. NOT applied to production. Existing RPCs/triggers unchanged.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.kinto_review_consents_v1(customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,version text NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.kinto_review_blocks_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,blocked_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(customer_id,blocked_customer_id),CHECK(customer_id<>blocked_customer_id));
CREATE TABLE private.kinto_review_reports_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,review_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('content','user')),reason text NOT NULL CHECK(reason IN('abuse','personal_data','spam','rights','other')),status text NOT NULL DEFAULT 'open' CHECK(status IN('open','dismissed','actioned')),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,resolved_by uuid,note text,UNIQUE(customer_id,review_id,kind));
CREATE TABLE private.kinto_deletion_requests_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','manual_review','cancelled','deleted')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),verified_by uuid,verification_note text,CHECK(status<>'deleted' OR customer_id IS NULL));
CREATE UNIQUE INDEX kinto_one_open_deletion_v1 ON private.kinto_deletion_requests_v1(customer_id) WHERE status IN('pending','verified','manual_review');
CREATE TABLE private.kinto_privacy_events_v1(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),event text NOT NULL,admin_id uuid,created_at timestamptz NOT NULL DEFAULT now());
-- Minimal, private restore ledger. No phone/email/session tokens or account UUIDs are stored here.
CREATE TABLE private.kinto_erasure_ledger_v1(sequence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,customer_hash text UNIQUE NOT NULL CHECK(customer_hash~'^[0-9a-f]{64}$'),request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),erased_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.kinto_erasure_ledger_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_erasure_ledger_v1 FROM PUBLIC,anon,authenticated;
-- Only a DB owner may configure this after a complete inventory/retention review.
-- Empty by default: the executor cannot run on production merely by installing SQL.
CREATE TABLE private.kinto_erasure_policy_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,inventory_signature text NOT NULL,policy_url text NOT NULL,retention_notice text NOT NULL,CHECK(policy_url LIKE 'https://shopkinto.com/%'),CHECK(length(retention_notice)>=20));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['kinto_review_consents_v1','kinto_review_blocks_v1','kinto_review_reports_v1','kinto_deletion_requests_v1','kinto_privacy_events_v1','kinto_erasure_policy_v1'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);END LOOP;END $$;

CREATE FUNCTION public.kinto_review_consent_v1(p_session_token text,p_version text,p_accept boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token);BEGIN
 IF p_version IS DISTINCT FROM '2026-10-25' THEN RAISE EXCEPTION 'REVIEW_POLICY_VERSION_REQUIRED';END IF;
 IF p_accept THEN INSERT INTO private.kinto_review_consents_v1(customer_id,version)VALUES(cid,p_version) ON CONFLICT(customer_id)DO UPDATE SET version=excluded.version,accepted_at=now();END IF;
 RETURN jsonb_build_object('accepted',EXISTS(SELECT 1 FROM private.kinto_review_consents_v1 WHERE customer_id=cid AND version=p_version),'version',p_version);
END $$;
CREATE FUNCTION public.kinto_review_submit_v1(p_session_token text,p_order_id uuid,p_product_id uuid,p_rating smallint,p_comment text,p_policy_version text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token);BEGIN
 IF p_policy_version IS DISTINCT FROM '2026-10-25' OR NOT EXISTS(SELECT 1 FROM private.kinto_review_consents_v1 WHERE customer_id=cid AND version=p_policy_version)THEN RAISE EXCEPTION 'REVIEW_POLICY_ACCEPTANCE_REQUIRED';END IF;
 RETURN public.customer_submit_product_review_v132(p_session_token,p_order_id,p_product_id,p_rating,p_comment);
END $$;
CREATE FUNCTION public.kinto_review_safety_v1(p_session_token text,p_action text,p_review_id uuid DEFAULT NULL,p_reason text DEFAULT NULL,p_block_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token);target uuid;rid uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text,501));
 IF p_action='list_blocks' THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label','مستخدم محظور','created_at',created_at) ORDER BY created_at DESC) FROM private.kinto_review_blocks_v1 WHERE customer_id=cid),'[]'::jsonb);END IF;
 IF p_action='unblock' THEN DELETE FROM private.kinto_review_blocks_v1 WHERE customer_id=cid AND id=p_block_id;RETURN jsonb_build_object('ok',true);END IF;
 SELECT customer_id INTO target FROM public.product_reviews WHERE id=p_review_id AND moderation_status='published';
 IF target IS NULL OR target=cid THEN RAISE EXCEPTION 'PUBLISHED_OTHER_REVIEW_REQUIRED';END IF;
 IF p_action='block' THEN INSERT INTO private.kinto_review_blocks_v1(customer_id,blocked_customer_id)VALUES(cid,target)ON CONFLICT DO NOTHING;RETURN jsonb_build_object('ok',true);END IF;
 IF p_action NOT IN('report_content','report_user') OR p_reason IS NULL OR p_reason NOT IN('abuse','personal_data','spam','rights','other')THEN RAISE EXCEPTION 'INVALID_REPORT';END IF;
 SELECT id INTO rid FROM private.kinto_review_reports_v1 WHERE customer_id=cid AND review_id=p_review_id AND kind=CASE WHEN p_action='report_user'THEN 'user' ELSE 'content' END;
 IF rid IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'id',rid,'duplicate',true);END IF;
 IF(SELECT count(*)FROM private.kinto_review_reports_v1 WHERE customer_id=cid AND created_at>now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'REPORT_RATE_LIMIT';END IF;
 INSERT INTO private.kinto_review_reports_v1(customer_id,review_id,kind,reason)VALUES(cid,p_review_id,CASE WHEN p_action='report_user'THEN 'user' ELSE 'content' END,p_reason)RETURNING id INTO rid;
 RETURN jsonb_build_object('ok',true,'id',rid);
END $$;
CREATE FUNCTION public.kinto_reviews_visible_v1(p_session_token text,p_product_id uuid,p_visitor_token text DEFAULT NULL,p_limit integer DEFAULT 8,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token);result jsonb;BEGIN
 -- Reuse the existing published-only projection without exposing author UUIDs.
 -- Filter before pagination using the underlying published rows, then fetch each projected row.
 SELECT jsonb_build_object('count',count(*),'average_rating',coalesce(round(avg(rating)::numeric,1),0))INTO result FROM public.product_reviews r WHERE r.product_id=p_product_id AND r.moderation_status='published' AND NOT EXISTS(SELECT 1 FROM private.kinto_review_blocks_v1 b WHERE b.customer_id=cid AND b.blocked_customer_id=r.customer_id);
 RETURN result||jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC) FROM (
 SELECT r.id,CASE WHEN nullif(trim(coalesce(c.name,'')),'')IS NULL THEN 'عميل KINTO' ELSE left(trim(c.name),1)||'***' END customer_name,r.rating,r.comment,r.verified_purchase,r.created_at,
 (SELECT count(*)::integer FROM public.product_review_helpful_votes h WHERE h.review_id=r.id)helpful_count,
 EXISTS(SELECT 1 FROM public.product_review_helpful_votes h WHERE h.review_id=r.id AND h.visitor_hash=CASE WHEN length(coalesce(p_visitor_token,''))BETWEEN 20 AND 200 THEN digest(p_visitor_token,'sha256')ELSE NULL END)liked,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'mime_type',i.mime_type,'data_url','data:'||i.mime_type||';base64,'||encode(p.image_bytes,'base64'),'sort_order',i.sort_order)ORDER BY i.sort_order)FROM public.product_review_images i JOIN public.product_review_image_payloads p ON p.image_id=i.id WHERE i.review_id=r.id AND i.moderation_status='published'),'[]'::jsonb)images
 FROM public.product_reviews r LEFT JOIN public.customers c ON c.id=r.customer_id
 WHERE r.product_id=p_product_id AND r.moderation_status='published' AND NOT EXISTS(SELECT 1 FROM private.kinto_review_blocks_v1 b WHERE b.customer_id=cid AND b.blocked_customer_id=r.customer_id)
 ORDER BY r.created_at DESC,r.id DESC LIMIT least(greatest(coalesce(p_limit,8),1),20)OFFSET greatest(coalesce(p_offset,0),0))q),'[]'::jsonb));
END $$;
CREATE FUNCTION public.kinto_deletion_request_v1(p_session_token text,p_action text,p_confirm boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token);req private.kinto_deletion_requests_v1;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text,502));
 IF p_action='status' THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,'updated_at',updated_at)ORDER BY created_at DESC)FROM(SELECT * FROM private.kinto_deletion_requests_v1 WHERE customer_id=cid ORDER BY created_at DESC LIMIT 10)x),'[]'::jsonb);END IF;
 SELECT * INTO req FROM private.kinto_deletion_requests_v1 WHERE customer_id=cid AND status IN('pending','verified','manual_review')FOR UPDATE;
 IF p_action='cancel' THEN IF req.id IS NOT NULL THEN UPDATE private.kinto_deletion_requests_v1 SET status='cancelled',updated_at=now()WHERE id=req.id;INSERT INTO private.kinto_privacy_events_v1(request_id,event)VALUES(req.id,'customer_cancelled');END IF;RETURN jsonb_build_object('ok',true);END IF;
 IF p_action<>'request' OR p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'DELETION_CONFIRMATION_REQUIRED';END IF;
 IF req.id IS NULL THEN IF(SELECT count(*)FROM private.kinto_deletion_requests_v1 WHERE customer_id=cid AND created_at>now()-interval '1 day')>=3 THEN RAISE EXCEPTION 'DELETION_RATE_LIMIT';END IF;INSERT INTO private.kinto_deletion_requests_v1(customer_id)VALUES(cid)RETURNING * INTO req;INSERT INTO private.kinto_privacy_events_v1(request_id,event)VALUES(req.id,'customer_requested');END IF;
 RETURN jsonb_build_object('ok',true,'id',req.id,'status',req.status);
END $$;
CREATE FUNCTION public.kinto_privacy_admin_v1(p_session_token text,p_kind text,p_id uuid DEFAULT NULL,p_action text DEFAULT 'list',p_note text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;rep private.kinto_review_reports_v1;req private.kinto_deletion_requests_v1;BEGIN
 IF p_action='list' THEN
  IF p_kind='reports' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(q))FROM(SELECT t.id,t.review_id,t.kind,t.reason,t.status,t.created_at,t.note,r.comment,r.rating,r.product_name_snapshot FROM private.kinto_review_reports_v1 t LEFT JOIN public.product_reviews r ON r.id=t.review_id ORDER BY t.created_at DESC,t.id DESC LIMIT 20 OFFSET greatest(coalesce(p_offset,0),0))q),'[]'::jsonb);END IF;
  IF p_kind='deletions'THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(q))FROM(SELECT r.id,r.customer_id,r.status,r.created_at,r.updated_at,to_jsonb(c)->>'name' customer_name,to_jsonb(c)->>'phone' customer_phone FROM private.kinto_deletion_requests_v1 r LEFT JOIN public.customers c ON c.id=r.customer_id ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET greatest(coalesce(p_offset,0),0))q),'[]'::jsonb);END IF;
  RAISE EXCEPTION 'INVALID_PRIVACY_QUEUE';
 END IF;
 IF length(trim(coalesce(p_note,'')))NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'ADMIN_NOTE_REQUIRED';END IF;
 IF p_kind='reports' AND p_action IN('dismiss','hide_review')THEN
  SELECT * INTO rep FROM private.kinto_review_reports_v1 WHERE id=p_id FOR UPDATE;IF rep.id IS NULL OR rep.status<>'open'THEN RAISE EXCEPTION 'OPEN_REPORT_REQUIRED';END IF;
  IF p_action='hide_review'THEN UPDATE public.product_reviews SET moderation_status='hidden',moderation_note=p_note,moderated_at=now(),moderated_by=aid WHERE id=rep.review_id;UPDATE public.product_review_images SET moderation_status='hidden',moderated_at=now(),moderated_by=aid WHERE review_id=rep.review_id;END IF;
  UPDATE private.kinto_review_reports_v1 SET status=CASE WHEN p_action='dismiss'THEN 'dismissed' ELSE 'actioned' END,resolved_at=now(),resolved_by=aid,note=p_note WHERE id=rep.id;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_kind='deletions'AND p_action IN('verify','hold')THEN
  SELECT * INTO req FROM private.kinto_deletion_requests_v1 WHERE id=p_id FOR UPDATE;IF req.id IS NULL OR req.status IN('cancelled','deleted')THEN RAISE EXCEPTION 'OPEN_REQUEST_REQUIRED';END IF;
  UPDATE private.kinto_deletion_requests_v1 SET status=CASE WHEN p_action='verify'THEN 'verified' ELSE 'manual_review' END,verified_by=CASE WHEN p_action='verify'THEN aid ELSE verified_by END,verification_note=p_note,updated_at=now()WHERE id=p_id;
  INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(p_id,p_action,aid);RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'INVALID_PRIVACY_ACTION';
END $$;
-- Terms enforcement also covers the existing submit/image endpoints; no financial trigger changes.
CREATE FUNCTION private.kinto_review_terms_guard_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE cid uuid;BEGIN
 IF TG_TABLE_NAME='product_reviews'THEN cid:=NEW.customer_id;ELSE SELECT customer_id INTO cid FROM public.product_reviews WHERE id=NEW.review_id;END IF;
 IF NOT EXISTS(SELECT 1 FROM private.kinto_review_consents_v1 WHERE customer_id=cid AND version='2026-10-25')THEN RAISE EXCEPTION 'REVIEW_POLICY_ACCEPTANCE_REQUIRED';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_review_terms_guard_v1()FROM PUBLIC,anon,authenticated;
CREATE TRIGGER kinto_review_terms_v1 BEFORE INSERT ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION private.kinto_review_terms_guard_v1();
CREATE TRIGGER kinto_review_image_terms_v1 BEFORE INSERT ON public.product_review_images FOR EACH ROW EXECUTE FUNCTION private.kinto_review_terms_guard_v1();
-- Conservative executor: reviewed schema only, fresh profiles only; operational data always holds.
CREATE FUNCTION private.kinto_erasure_signature_v1()RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 -- Approval is invalidated by constraints, triggers, function code and policies as well as columns.
 -- Definitions only; no customer rows or secrets are included in the returned hash.
 WITH relations AS (
  SELECT c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE(n.nspname IN('public','private')OR(n.nspname='storage'AND c.relname IN('objects','buckets')))AND c.relkind IN('r','p')
 ), parts AS (
  SELECT 'relation:'||r.nspname||'.'||r.relname AS key,
   r.relrowsecurity::text||':'||r.relforcerowsecurity::text AS value FROM relations r
  UNION ALL SELECT 'column:'||r.nspname||'.'||r.relname||'.'||a.attname,
   a.atttypid::text||':'||a.atttypmod::text||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
   FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
   LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  UNION ALL SELECT 'constraint:'||r.nspname||'.'||r.relname||'.'||f.conname,
   pg_get_constraintdef(f.oid)||':'||f.convalidated::text FROM relations r JOIN pg_constraint f ON f.conrelid=r.oid
  UNION ALL SELECT 'trigger:'||r.nspname||'.'||r.relname||'.'||t.tgname,
   pg_get_triggerdef(t.oid)||':'||t.tgenabled::text FROM relations r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN('public','private')AND p.prokind IN('f','p')
  UNION ALL SELECT 'policy:'||r.nspname||'.'||r.relname||'.'||p.polname,
   p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
   FROM relations r JOIN pg_policy p ON p.polrelid=r.oid
  UNION ALL SELECT 'bucket:'||b.id,jsonb_build_object('public',b.public,'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types)::text
   FROM storage.buckets b WHERE b.id IN('product-review-images','chat-attachments','kinto-customer-notice-media')
 )SELECT md5(coalesce(jsonb_agg(jsonb_build_array(key,value)ORDER BY key)::text,''))FROM parts;
$$;
-- Only these non-financial preference relations are managed. Unknown cascades/triggers hold erasure.
CREATE FUNCTION private.kinto_privacy_preferences_ready_v1()RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE name text;rel oid;owned integer;fk_ok boolean;managed oid[]:='{}';BEGIN
 FOREACH name IN ARRAY ARRAY['public.customer_local_carts','public.customer_favorite_lists','public.customer_favorite_items','public.customer_notification_reads_v155','private.kinto_review_blocks_v1']LOOP
  rel:=to_regclass(name);IF rel IS NULL THEN CONTINUE;END IF;managed:=array_append(managed,rel);
  SELECT count(*)INTO owned FROM pg_attribute WHERE attrelid=rel AND attname='customer_id'AND atttypid='uuid'::regtype AND NOT attisdropped;
  IF owned<>1 THEN RETURN false;END IF;
  IF name='public.customer_favorite_items'THEN
   SELECT EXISTS(SELECT 1 FROM pg_constraint f WHERE f.conrelid=rel AND f.contype='f'AND f.confdeltype='c'AND f.confrelid=to_regclass('public.customer_favorite_lists')AND
    (SELECT array_agg(a.attname::text ORDER BY k.ord)FROM unnest(f.conkey)WITH ORDINALITY k(num,ord)JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.num)=ARRAY['list_id','customer_id']AND
    (SELECT array_agg(a.attname::text ORDER BY k.ord)FROM unnest(f.confkey)WITH ORDINALITY k(num,ord)JOIN pg_attribute a ON a.attrelid=f.confrelid AND a.attnum=k.num)=ARRAY['id','customer_id'])INTO fk_ok;
  ELSE
   SELECT EXISTS(SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=f.conkey[1]WHERE f.contype='f'AND f.confdeltype='c'AND f.conrelid=rel AND f.confrelid='public.customers'::regclass AND cardinality(f.conkey)=1 AND a.attname='customer_id'AND f.confkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid='public.customers'::regclass AND attname='id'))INTO fk_ok;
  END IF;
  IF NOT fk_ok THEN RETURN false;END IF;
  IF name='private.kinto_review_blocks_v1'AND NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_constraint f ON f.conrelid=a.attrelid AND f.conkey=ARRAY[a.attnum]::smallint[]WHERE a.attrelid=rel AND a.attname='blocked_customer_id'AND a.atttypid='uuid'::regtype AND NOT a.attisdropped AND f.contype='f'AND f.confrelid='public.customers'::regclass AND f.confkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid='public.customers'::regclass AND attname='id'))THEN RETURN false;END IF;

  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal AND tgenabled<>'D'AND(tgtype::integer&8)<>0)THEN RETURN false;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f'AND confrelid=ANY(managed)AND NOT(conrelid=ANY(managed)))THEN RETURN false;END IF;
 RETURN true;
END$$;
CREATE FUNCTION private.kinto_privacy_preferences_purge_v1(cid uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE name text;rel oid;cnt integer;counts jsonb:='{}';BEGIN
 IF cid IS NULL OR NOT private.kinto_privacy_preferences_ready_v1()THEN RAISE EXCEPTION 'PREFERENCE_SCHEMA_NOT_VERIFIED';END IF;
 -- Drain preference writers too. Lock every managed relation before the first DELETE.
 FOREACH name IN ARRAY ARRAY['public.customer_local_carts','public.customer_favorite_lists','public.customer_favorite_items','public.customer_notification_reads_v155','private.kinto_review_blocks_v1']LOOP
  rel:=to_regclass(name);IF rel IS NOT NULL THEN EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',rel::regclass);END IF;
 END LOOP;
 FOREACH name IN ARRAY ARRAY['public.customer_favorite_items','public.customer_favorite_lists','public.customer_local_carts','public.customer_notification_reads_v155','private.kinto_review_blocks_v1']LOOP
  rel:=to_regclass(name);IF rel IS NULL THEN CONTINUE;END IF;
  IF name='private.kinto_review_blocks_v1'THEN EXECUTE format('DELETE FROM %s WHERE customer_id=$1 OR blocked_customer_id=$1',rel::regclass)USING cid;
  ELSE EXECUTE format('DELETE FROM %s WHERE customer_id=$1',rel::regclass)USING cid;END IF;
  GET DIAGNOSTICS cnt=ROW_COUNT;counts:=counts||jsonb_build_object(name,cnt);
 END LOOP;RETURN counts;
END$$;
-- Read-only operator helpers; no public RPC, auto-restore or approval from partial input.
CREATE FUNCTION private.kinto_privacy_erasure_ledger_export_v1(p_after_sequence bigint DEFAULT 0,p_limit integer DEFAULT 200)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(l)ORDER BY sequence_id),'[]'::jsonb)FROM(SELECT *FROM private.kinto_erasure_ledger_v1 WHERE sequence_id>greatest(coalesce(p_after_sequence,0),0)ORDER BY sequence_id LIMIT least(greatest(coalesce(p_limit,200),1),500))l;
$$;
CREATE FUNCTION private.kinto_privacy_restore_matches_v1(p_external_hashes jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE matches jsonb;BEGIN
 IF jsonb_typeof(p_external_hashes)IS DISTINCT FROM 'array'THEN RAISE EXCEPTION 'EXTERNAL_ERASURE_LEDGER_REQUIRED';END IF;
 IF jsonb_array_length(p_external_hashes)NOT BETWEEN 1 AND 10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_external_hashes)x WHERE jsonb_typeof(x)<>'string'OR(x#>>'{}')!~'^[0-9a-f]{64}$')THEN RAISE EXCEPTION 'EXTERNAL_ERASURE_LEDGER_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(DISTINCT encode(digest(c.id::text,'sha256'),'hex')),'[]'::jsonb)INTO matches FROM public.customers c WHERE encode(digest(c.id::text,'sha256'),'hex')IN(SELECT jsonb_array_elements_text(p_external_hashes));
 RETURN jsonb_build_object('matched_hashes',matches,'coverage_verified',false,'restore_authorized',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_preferences_ready_v1(),private.kinto_privacy_preferences_purge_v1(uuid),private.kinto_privacy_erasure_ledger_export_v1(bigint,integer),private.kinto_privacy_restore_matches_v1(jsonb)FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.kinto_erasure_inventory_v1(cid uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE r record;cnt bigint;holds jsonb:='[]';preferences_ready boolean:=private.kinto_privacy_preferences_ready_v1();BEGIN
 FOR r IN SELECT DISTINCT n.nspname,c.relname,a.attname,
 EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.contype='f' AND fk.conrelid=c.oid AND a.attnum=ANY(fk.conkey)AND fk.confrelid='public.customers'::regclass)has_fk
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname IN('public','private')AND c.relkind IN('r','p')AND NOT(n.nspname='public'AND c.relname='customers')AND(a.attname='customer_id'OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f'AND f.conrelid=c.oid AND a.attnum=ANY(f.conkey)AND f.confrelid='public.customers'::regclass))
 LOOP
  IF r.nspname='private'AND r.relname IN('kinto_deletion_requests_v1','kinto_review_consents_v1')THEN CONTINUE;END IF;
  IF r.nspname='public'AND r.relname='customer_review_sessions'THEN CONTINUE;END IF;
  IF preferences_ready AND(r.nspname||'.'||r.relname)=ANY(ARRAY['public.customer_local_carts','public.customer_favorite_lists','public.customer_favorite_items','public.customer_notification_reads_v155','private.kinto_review_blocks_v1'])THEN CONTINUE;END IF;
  EXECUTE format('SELECT count(*)FROM %I.%I WHERE %I::text=$1',r.nspname,r.relname,r.attname)INTO cnt USING cid::text;
  IF cnt>0 OR NOT r.has_fk THEN holds:=holds||jsonb_build_array(jsonb_build_object('relation',r.nspname||'.'||r.relname,'column',r.attname,'rows',cnt,'reason',CASE WHEN NOT r.has_fk THEN 'unverified_write_relationship'ELSE 'associated_data_requires_review'END));END IF;
 END LOOP;
 IF NOT preferences_ready THEN holds:=holds||jsonb_build_array(jsonb_build_object('relation','preferences','reason','preference_schema_not_verified'));END IF;
 -- Identity snapshots without a customer key cannot be safely matched by name.
 IF to_regclass('public.local_orders')IS NOT NULL THEN holds:=holds||jsonb_build_array(jsonb_build_object('relation','public.local_orders','reason','legacy_identity_mapping_required'));END IF;
 RETURN jsonb_build_object('holds',holds,'fresh_profile_eligible',jsonb_array_length(holds)=0,'inventory_signature',private.kinto_erasure_signature_v1());
END $$;
CREATE FUNCTION public.kinto_deletion_preflight_v1(p_session_token text,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;cid uuid;BEGIN SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status NOT IN('cancelled','deleted');IF cid IS NULL THEN RAISE EXCEPTION 'OPEN_REQUEST_REQUIRED';END IF;RETURN private.kinto_erasure_inventory_v1(cid);END $$;
-- Internal finalizer helper only. Revoking current tokens alone is NOT account deletion.
CREATE FUNCTION private.kinto_privacy_revoke_sessions_v1(cid uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE primary_count integer;portal_count integer:=0;has_portal boolean:=to_regclass('public.customer_portal_sessions')IS NOT NULL;BEGIN
 IF cid IS NULL THEN RAISE EXCEPTION 'CUSTOMER_ID_REQUIRED';END IF;
 -- Validate the observed UUID ownership link before taking any destructive action.
 IF has_portal AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.customer_portal_sessions') AND attname='customer_id'AND atttypid='uuid'::regtype AND NOT attisdropped)THEN RAISE EXCEPTION 'PORTAL_SESSION_SCHEMA_NOT_VERIFIED';END IF;
 LOCK TABLE public.customer_review_sessions IN ACCESS EXCLUSIVE MODE;
 IF has_portal THEN EXECUTE 'LOCK TABLE public.customer_portal_sessions IN ACCESS EXCLUSIVE MODE';END IF;
 -- Both paths are drained before deleting either set of tokens. No identity/phone matching.
 DELETE FROM public.customer_review_sessions WHERE customer_id=cid;GET DIAGNOSTICS primary_count=ROW_COUNT;
 IF has_portal THEN EXECUTE 'DELETE FROM public.customer_portal_sessions WHERE customer_id=$1' USING cid;GET DIAGNOSTICS portal_count=ROW_COUNT;END IF;
 RETURN jsonb_build_object('review_sessions_removed',primary_count,'portal_sessions_removed',portal_count,'account_deleted',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_revoke_sessions_v1(uuid)FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.kinto_deletion_execute_v1(p_session_token text,p_request_id uuid,p_confirm_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;req private.kinto_deletion_requests_v1;cfg private.kinto_erasure_policy_v1;plan jsonb;BEGIN
 IF p_request_id IS DISTINCT FROM p_confirm_request_id THEN RAISE EXCEPTION 'EXACT_REQUEST_CONFIRMATION_REQUIRED';END IF;
 SELECT *INTO cfg FROM private.kinto_erasure_policy_v1 WHERE singleton AND enabled;
 IF cfg.singleton IS NULL OR cfg.inventory_signature IS DISTINCT FROM private.kinto_erasure_signature_v1()THEN RAISE EXCEPTION 'ERASURE_POLICY_OR_INVENTORY_NOT_VERIFIED';END IF;
 SELECT *INTO req FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id FOR UPDATE;
 IF req.status='deleted'AND req.customer_id IS NULL THEN RETURN jsonb_build_object('ok',true,'status','deleted','duplicate',true);END IF;
 IF req.status IS DISTINCT FROM 'verified'OR req.customer_id IS NULL OR req.verified_by IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;
 -- Block new session validations while finishing in-flight session transactions.
 -- Bound lock wait; this endpoint remains disabled on the real unreviewed schema.
 LOCK TABLE public.customer_review_sessions IN ACCESS EXCLUSIVE MODE;
 PERFORM 1 FROM public.customers WHERE id=req.customer_id FOR UPDATE;
 plan:=private.kinto_erasure_inventory_v1(req.customer_id);
 IF NOT(plan->>'fresh_profile_eligible')::boolean THEN
  UPDATE private.kinto_deletion_requests_v1 SET status='manual_review',updated_at=now()WHERE id=req.id;
  INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(req.id,'manual_review_required',aid);
  RETURN jsonb_build_object('ok',false,'status','manual_review','plan',plan);
 END IF;
 PERFORM private.kinto_privacy_revoke_sessions_v1(req.customer_id);
 PERFORM private.kinto_privacy_preferences_purge_v1(req.customer_id);
 INSERT INTO private.kinto_erasure_ledger_v1(customer_hash,request_id)VALUES(encode(digest(req.customer_id::text,'sha256'),'hex'),req.id);
 DELETE FROM private.kinto_review_consents_v1 WHERE customer_id=req.customer_id;
 DELETE FROM public.customer_review_login_attempts WHERE identity_hash IN(SELECT digest(lower(trim(v.value)),'sha256')FROM public.customers c CROSS JOIN LATERAL jsonb_each_text(to_jsonb(c))v WHERE c.id=req.customer_id AND v.key IN('phone','email','code','customer_code')AND coalesce(trim(v.value),'')<>'');
 DELETE FROM public.customers WHERE id=req.customer_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_MISSING';END IF;
 UPDATE private.kinto_deletion_requests_v1 SET status='deleted',verification_note=NULL,updated_at=now()WHERE id=req.id;
 INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(req.id,'fresh_account_deleted',aid);
 RETURN jsonb_build_object('ok',true,'status','deleted');
END $$;
REVOKE ALL ON FUNCTION private.kinto_erasure_signature_v1(),private.kinto_erasure_inventory_v1(uuid)FROM PUBLIC,anon,authenticated;
-- No public execute rights left implicitly on any new definer.
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('kinto_review_consent_v1','kinto_review_submit_v1','kinto_review_safety_v1','kinto_reviews_visible_v1','kinto_deletion_request_v1','kinto_privacy_admin_v1','kinto_deletion_preflight_v1','kinto_deletion_execute_v1')LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f.sig);END LOOP;END $$;
COMMIT;
