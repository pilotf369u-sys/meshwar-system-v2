-- Reviewed single-review erasure only. Source-only; existing disabled base policy applies.
-- Review images/tickets must already be safely removed; never cascade over file metadata.
BEGIN;
CREATE TABLE private.kinto_privacy_review_decisions_v1(
 request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),review_id uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^[0-9a-f]{64}$'),state text NOT NULL CHECK(state IN('approved','retained','erased')),
 note text,review_on timestamptz,reviewed_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),erased_key_hash text,erased_at timestamptz,
 PRIMARY KEY(request_id,review_id),CHECK((state='retained')=(review_on IS NOT NULL)),
 CHECK((state='erased'AND note IS NULL AND erased_key_hash~'^[0-9a-f]{64}$'AND erased_key_hash IS NOT NULL AND erased_at IS NOT NULL)OR(state<>'erased'AND length(trim(note))BETWEEN 5 AND 500 AND note IS NOT NULL))
);
ALTER TABLE private.kinto_privacy_review_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_privacy_review_decisions_v1 FROM PUBLIC,anon,authenticated;
-- Reports have a deliberately non-FK historical review identifier. Protect only
-- open targets: resolved moderation evidence can remain after review erasure.
CREATE FUNCTION private.kinto_privacy_open_report_target_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.status='open'THEN
  PERFORM 1 FROM public.product_reviews WHERE id=NEW.review_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_REPORT_TARGET_CHANGED';END IF;
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER kinto_privacy_open_report_target_v1 BEFORE INSERT OR UPDATE OF review_id,status ON private.kinto_review_reports_v1 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_open_report_target_v1();
CREATE FUNCTION private.kinto_privacy_review_hash_v1(p_review jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,extensions,pg_temp AS $$SELECT encode(digest(p_review::text,'sha256'),'hex')$$;
CREATE FUNCTION private.kinto_privacy_review_schema_v1()RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=ANY(ARRAY[to_regclass('public.product_reviews'),to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes')])AND(c.relkind<>'r'OR c.relforcerowsecurity OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=c.oid OR inhrelid=c.oid)OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=c.oid)))
 AND(SELECT count(*)=4 FROM pg_class WHERE oid=ANY(ARRAY[to_regclass('public.product_reviews'),to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes')]))
 AND NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=ANY(ARRAY[to_regclass('private.kinto_review_reports_v1'),to_regclass('private.kinto_privacy_media_jobs_v1'),to_regclass('private.kinto_privacy_review_decisions_v1')])AND relforcerowsecurity)
 AND(EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND(rolsuper OR rolbypassrls))OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=ANY(ARRAY[to_regclass('public.product_reviews'),to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes'),to_regclass('private.kinto_review_reports_v1'),to_regclass('private.kinto_privacy_media_jobs_v1')])AND relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)))
 AND NOT EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f'AND f.confrelid=to_regclass('public.product_reviews')AND NOT(f.conrelid=ANY(ARRAY[to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes')])AND f.confdeltype='c'AND f.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=f.conrelid AND attname='review_id')]::smallint[]AND f.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='id')]::smallint[]))
 AND(SELECT count(DISTINCT conrelid)=3 FROM pg_constraint WHERE contype='f'AND confrelid=to_regclass('public.product_reviews')AND conrelid=ANY(ARRAY[to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes')]))
 AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f'AND confrelid=to_regclass('public.product_review_helpful_votes'))
 AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=ANY(ARRAY[to_regclass('public.product_reviews'),to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes')])AND NOT t.tgisinternal AND t.tgenabled<>'D'AND(t.tgtype::integer&8)<>0 AND NOT(t.tgfoid=to_regprocedure('private.kinto_privacy_media_guard_v1()')AND((t.tgrelid=to_regclass('public.product_reviews')AND t.tgname='kinto_privacy_media_review_v1')OR(t.tgrelid=to_regclass('public.product_review_images')AND t.tgname='kinto_privacy_media_image_v1')OR(t.tgrelid=to_regclass('private.product_review_upload_tickets_v150')AND t.tgname='kinto_privacy_media_ticket_v1'))))
 -- Unknown logical links must not silently outlive an erased review.
 AND NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private')AND c.relkind IN('r','p')AND a.attname='review_id'AND NOT a.attisdropped AND(c.oid<>ALL(ARRAY[to_regclass('public.product_review_images'),to_regclass('private.product_review_upload_tickets_v150'),to_regclass('public.product_review_helpful_votes'),to_regclass('private.kinto_privacy_media_jobs_v1'),to_regclass('private.kinto_review_reports_v1'),to_regclass('private.kinto_privacy_review_decisions_v1')])))
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('private.kinto_review_reports_v1')AND tgname='kinto_privacy_open_report_target_v1'AND tgfoid=to_regprocedure('private.kinto_privacy_open_report_target_v1()')AND tgenabled IN('O','A')AND(tgtype::integer&1)=1 AND(tgtype::integer&2)=2 AND(tgtype::integer&4)=4 AND(tgtype::integer&16)=16)
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.product_reviews')AND attnum>0 AND NOT attisdropped AND attname NOT IN('id','customer_id','order_id','order_store_segment_id','store_id','product_id','product_reference','product_name_snapshot','product_image_snapshot','rating','comment','verified_purchase','moderation_status','moderation_note','moderated_at','moderated_by','created_at','updated_at'))
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.product_review_helpful_votes')AND attnum>0 AND NOT attisdropped AND attname NOT IN('id','review_id','visitor_hash','created_at'));
$$;
CREATE FUNCTION public.kinto_privacy_review_record_v1(p_session_token text,p_request_id uuid,p_action text DEFAULT 'list',p_review_id uuid DEFAULT NULL,p_expected_hash text DEFAULT NULL,p_note text DEFAULT '',p_review_on timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;r jsonb;aid uuid;BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','detail','approve_erase','retain')THEN RAISE EXCEPTION 'INVALID_REVIEW_PRIVACY_ACTION';END IF;
 cid:=private.kinto_privacy_chat_context_v1(p_session_token,p_request_id,p_action NOT IN('list','detail'));
 IF p_action='list'THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('review_id',q.id,'product_name',q.product_name_snapshot,'rating',q.rating,'preview',left(coalesce(q.comment,''),2000),'content_hash',private.kinto_privacy_review_hash_v1(to_jsonb(q)),'state',d.state)ORDER BY q.id)FROM(SELECT *FROM public.product_reviews WHERE customer_id=cid AND(p_after_id IS NULL OR id>p_after_id)ORDER BY id LIMIT 20)q LEFT JOIN private.kinto_privacy_review_decisions_v1 d ON d.request_id=p_request_id AND d.review_id=q.id),'[]'::jsonb);END IF;
 SELECT to_jsonb(x)INTO r FROM public.product_reviews x WHERE x.id=p_review_id AND x.customer_id=cid FOR UPDATE;
 IF r IS NULL THEN RAISE EXCEPTION 'OWNED_PRODUCT_REVIEW_REQUIRED';END IF;
 IF p_action='detail'THEN RETURN jsonb_build_object('review_id',p_review_id,'comment',left(coalesce(r->>'comment',''),20000),'moderation_note',left(coalesce(r->>'moderation_note',''),20000),'detail_truncated',greatest(length(coalesce(r->>'comment','')),length(coalesce(r->>'moderation_note','')))>20000,'content_hash',private.kinto_privacy_review_hash_v1(r),'has_images',EXISTS(SELECT 1 FROM public.product_review_images WHERE review_id=p_review_id),'has_tickets',EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 WHERE review_id=p_review_id),'has_open_report',EXISTS(SELECT 1 FROM private.kinto_review_reports_v1 WHERE review_id=p_review_id AND status='open'));END IF;
 IF private.kinto_privacy_review_hash_v1(r)IS DISTINCT FROM p_expected_hash THEN RAISE EXCEPTION 'REVIEW_CONTENT_CHANGED';END IF;
 IF length(trim(coalesce(p_note,'')))NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'ADMIN_NOTE_REQUIRED';END IF;
 IF p_action='retain'AND(p_review_on IS NULL OR p_review_on<=now())THEN RAISE EXCEPTION 'RETENTION_REVIEW_DATE_REQUIRED';END IF;
 aid:=private.require_admin_session_v147(p_session_token)::uuid;
 INSERT INTO private.kinto_privacy_review_decisions_v1(request_id,review_id,content_hash,state,note,review_on,reviewed_by)VALUES(p_request_id,p_review_id,p_expected_hash,CASE WHEN p_action='retain'THEN 'retained'ELSE 'approved'END,trim(p_note),CASE WHEN p_action='retain'THEN p_review_on ELSE NULL END,aid)
 ON CONFLICT(request_id,review_id)DO UPDATE SET content_hash=excluded.content_hash,state=excluded.state,note=excluded.note,review_on=excluded.review_on,reviewed_by=excluded.reviewed_by,updated_at=now()WHERE kinto_privacy_review_decisions_v1.state<>'erased';
 IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_ALREADY_ERASED';END IF;
 RETURN jsonb_build_object('reviewed',true,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_review_erase_v1(p_session_token text,p_request_id uuid,p_review_id uuid,p_confirm_review_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;r jsonb;d private.kinto_privacy_review_decisions_v1;aid uuid;affected integer;BEGIN
 cid:=private.kinto_privacy_chat_context_v1(p_session_token,p_request_id);
 IF p_review_id IS NULL OR p_review_id IS DISTINCT FROM p_confirm_review_id THEN RAISE EXCEPTION 'EXACT_REVIEW_CONFIRMATION_REQUIRED';END IF;
 LOCK TABLE public.product_reviews,public.product_review_images,private.product_review_upload_tickets_v150,public.product_review_helpful_votes IN ROW EXCLUSIVE MODE;
 LOCK TABLE private.kinto_review_reports_v1 IN SHARE MODE;
 PERFORM private.kinto_privacy_chat_context_v1(p_session_token,p_request_id);
 IF NOT private.kinto_privacy_review_schema_v1()THEN RAISE EXCEPTION 'REVIEW_ERASURE_SCHEMA_NOT_VERIFIED';END IF;
 SELECT *INTO d FROM private.kinto_privacy_review_decisions_v1 WHERE request_id=p_request_id AND review_id=p_review_id FOR UPDATE;
 IF d.state='erased'THEN
  IF EXISTS(SELECT 1 FROM public.product_reviews WHERE id=p_review_id)THEN RAISE EXCEPTION 'ERASED_REVIEW_REAPPEARED';END IF;
  RETURN jsonb_build_object('erased',true,'duplicate',true,'account_deleted',false);
 END IF;
 IF d.state IS DISTINCT FROM 'approved'THEN RAISE EXCEPTION 'REVIEW_ERASURE_APPROVAL_REQUIRED';END IF;
 -- Match the existing media worker's job-before-review lock order.
 PERFORM 1 FROM private.kinto_privacy_media_jobs_v1 WHERE review_id=p_review_id ORDER BY id FOR UPDATE;
 SELECT to_jsonb(x)INTO r FROM public.product_reviews x WHERE x.id=p_review_id AND x.customer_id=cid FOR UPDATE;
 IF r IS NULL OR private.kinto_privacy_review_hash_v1(r)IS DISTINCT FROM d.content_hash THEN RAISE EXCEPTION 'REVIEW_CONTENT_CHANGED';END IF;
 IF greatest(length(coalesce(r->>'comment','')),length(coalesce(r->>'moderation_note','')))>20000 THEN RAISE EXCEPTION 'REVIEW_DETAIL_REQUIRES_MANUAL_REVIEW';END IF;
 -- Parent FOR UPDATE prevents concurrent child-FK insertion until this transaction ends.
 IF EXISTS(SELECT 1 FROM public.product_review_images WHERE review_id=p_review_id)OR EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 WHERE review_id=p_review_id)OR EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE review_id=p_review_id AND state<>'removed')THEN RAISE EXCEPTION 'REVIEW_MEDIA_CLEANUP_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM private.kinto_review_reports_v1 WHERE review_id=p_review_id AND status='open')THEN RAISE EXCEPTION 'OPEN_REVIEW_REPORT_REQUIRES_RESOLUTION';END IF;
 DELETE FROM public.product_reviews WHERE id=p_review_id AND customer_id=cid;
 GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>1 THEN RAISE EXCEPTION 'REVIEW_ERASURE_NOT_CONFIRMED';END IF;
 UPDATE private.kinto_privacy_review_decisions_v1 SET state='erased',note=NULL,review_on=NULL,erased_key_hash=encode(digest(p_review_id::text,'sha256'),'hex'),erased_at=now(),updated_at=now()WHERE request_id=p_request_id AND review_id=p_review_id;
 aid:=private.require_admin_session_v147(p_session_token)::uuid;
 INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(p_request_id,'reviewed_product_review_erased',aid);
 RETURN jsonb_build_object('erased',true,'account_deleted',false);
END$$;
CREATE FUNCTION private.kinto_privacy_review_cancel_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$BEGIN IF NEW.status='cancelled'AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(SELECT 1 FROM private.kinto_privacy_review_decisions_v1 WHERE request_id=OLD.id AND state='erased')THEN RAISE EXCEPTION 'PRIVACY_DELETION_ALREADY_STARTED';END IF;RETURN NEW;END$$;
CREATE TRIGGER kinto_privacy_review_cancel_v1 BEFORE UPDATE OF status ON private.kinto_deletion_requests_v1 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_review_cancel_v1();
CREATE FUNCTION private.kinto_privacy_restore_review_matches_v1(p_hashes jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE matches jsonb;BEGIN
 IF jsonb_typeof(p_hashes)IS DISTINCT FROM 'array'THEN RAISE EXCEPTION 'EXTERNAL_REVIEW_LEDGER_REQUIRED';END IF;
 IF jsonb_array_length(p_hashes)NOT BETWEEN 1 AND 10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_hashes)x WHERE jsonb_typeof(x)<>'string'OR(x#>>'{}')!~'^[0-9a-f]{64}$')THEN RAISE EXCEPTION 'EXTERNAL_REVIEW_LEDGER_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(DISTINCT encode(digest(id::text,'sha256'),'hex')),'[]')INTO matches FROM public.product_reviews WHERE encode(digest(id::text,'sha256'),'hex')IN(SELECT jsonb_array_elements_text(p_hashes));
 RETURN jsonb_build_object('matched_hashes',matches,'coverage_verified',false,'restore_authorized',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_open_report_target_v1(),private.kinto_privacy_review_hash_v1(jsonb),private.kinto_privacy_review_schema_v1(),private.kinto_privacy_review_cancel_v1(),private.kinto_privacy_restore_review_matches_v1(jsonb),public.kinto_privacy_review_record_v1(text,uuid,text,uuid,text,text,timestamptz,uuid),public.kinto_privacy_review_erase_v1(text,uuid,uuid,uuid)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_review_record_v1(text,uuid,text,uuid,text,text,timestamptz,uuid)TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_review_erase_v1(text,uuid,uuid,uuid)TO service_role;
COMMIT;
