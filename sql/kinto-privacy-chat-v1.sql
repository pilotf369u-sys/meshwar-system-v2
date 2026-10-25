-- Additive reviewed text-only chat erasure. Disabled by the existing empty erasure policy.
-- File-bearing messages always require separate review; no Storage/order/payment writes.
BEGIN;
CREATE TABLE private.kinto_privacy_chat_decisions_v1(
 request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),message_id bigint NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^[0-9a-f]{64}$'),state text NOT NULL CHECK(state IN('approved','retained','erased')),
 note text,review_on timestamptz,reviewed_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),erased_key_hash text,erased_at timestamptz,
 PRIMARY KEY(request_id,message_id),CHECK((state='retained')=(review_on IS NOT NULL)),
 CHECK((state='erased'AND note IS NULL AND erased_key_hash IS NOT NULL AND erased_key_hash~'^[0-9a-f]{64}$'AND erased_at IS NOT NULL)OR(state<>'erased'AND note IS NOT NULL AND length(trim(note))BETWEEN 5 AND 500))
);
ALTER TABLE private.kinto_privacy_chat_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_privacy_chat_decisions_v1 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.kinto_privacy_chat_hash_v1(m jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,extensions,pg_temp AS $$
 SELECT encode(digest(jsonb_build_object('id',m->>'id','customer_id',m->>'customer_id','employee_id',m->>'employee_id','sender_type',m->>'sender_type','message',m->>'message','file_url',m->>'file_url','created_at',m->>'created_at')::text,'sha256'),'hex');
$$;
CREATE FUNCTION private.kinto_privacy_chat_context_v1(p_session_token text,p_request_id uuid,p_enabled boolean DEFAULT true)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;cid uuid;BEGIN
 SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status='verified'AND verified_by IS NOT NULL FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;
 IF p_enabled AND NOT EXISTS(SELECT 1 FROM private.kinto_erasure_policy_v1 WHERE singleton AND enabled AND inventory_signature=private.kinto_erasure_signature_v1())THEN RAISE EXCEPTION 'ERASURE_POLICY_OR_INVENTORY_NOT_VERIFIED';END IF;RETURN cid;
END$$;
CREATE FUNCTION private.kinto_privacy_chat_schema_v1()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT(SELECT count(*)=5 FROM pg_attribute WHERE attrelid=to_regclass('public.messages')AND NOT attisdropped AND((attname='id'AND atttypid='int8'::regtype)OR(attname='customer_id'AND atttypid='uuid'::regtype)OR(attname IN('message','file_url','sender_type')AND atttypid='text'::regtype)))
 AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.messages')AND relkind='r')
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.messages')AND attnum>0 AND NOT attisdropped AND attname NOT IN('id','created_at','customer_id','employee_id','sender_type','message','file_url','read_by_employee','read_by_customer'))
 AND NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=to_regclass('public.messages')OR inhrelid=to_regclass('public.messages'))
 AND NOT EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=to_regclass('public.messages'))
 AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f'AND confrelid=to_regclass('public.messages'))
 AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.messages')AND NOT tgisinternal AND tgenabled<>'D'AND(tgtype::integer&8)<>0);
$$;
CREATE FUNCTION public.kinto_privacy_chat_review_v1(p_session_token text,p_request_id uuid,p_action text DEFAULT 'list',p_message_id bigint DEFAULT NULL,p_expected_hash text DEFAULT NULL,p_note text DEFAULT '',p_review_on timestamptz DEFAULT NULL,p_after_id bigint DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;aid uuid;m jsonb;h text;existing_state text;BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','detail','approve_erase','retain')THEN RAISE EXCEPTION 'INVALID_CHAT_REVIEW_ACTION';END IF;
 cid:=private.kinto_privacy_chat_context_v1(p_session_token,p_request_id,p_action NOT IN('list','detail'));
 IF NOT private.kinto_privacy_chat_schema_v1()THEN RAISE EXCEPTION 'CHAT_SCHEMA_REVIEW_REQUIRED';END IF;
 IF p_action='list'THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('message_id',q.id::text,'sender_type',q.sender_type,'preview',left(coalesce(q.message,''),1000),'has_attachment',length(trim(coalesce(q.file_url,'')))>0,'content_hash',private.kinto_privacy_chat_hash_v1(to_jsonb(q)),'state',d.state,'review_on',d.review_on)ORDER BY q.id)
 FROM(SELECT *FROM public.messages WHERE customer_id=cid AND(p_after_id IS NULL OR id>p_after_id)ORDER BY id LIMIT 20)q LEFT JOIN private.kinto_privacy_chat_decisions_v1 d ON d.request_id=p_request_id AND d.message_id=q.id),'[]'::jsonb);END IF;
 SELECT to_jsonb(x)INTO m FROM public.messages x WHERE x.id=p_message_id AND x.customer_id=cid FOR UPDATE;
 IF m IS NULL THEN RAISE EXCEPTION 'OWNED_CHAT_MESSAGE_REQUIRED';END IF;h:=private.kinto_privacy_chat_hash_v1(m);
 IF p_action='detail'THEN RETURN jsonb_build_object('message_id',p_message_id::text,'body',left(coalesce(m->>'message',''),20000),'truncated',length(coalesce(m->>'message',''))>20000,'has_attachment',length(trim(coalesce(m->>'file_url','')))>0,'content_hash',h);END IF;
 IF p_action NOT IN('approve_erase','retain')THEN RAISE EXCEPTION 'INVALID_CHAT_REVIEW_ACTION';END IF;
 IF p_expected_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'CHAT_MESSAGE_CHANGED';END IF;
 IF length(trim(coalesce(p_note,'')))NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'ADMIN_NOTE_REQUIRED';END IF;
 SELECT state INTO existing_state FROM private.kinto_privacy_chat_decisions_v1 WHERE request_id=p_request_id AND message_id=p_message_id FOR UPDATE;
 IF existing_state='erased'THEN RAISE EXCEPTION 'CHAT_ALREADY_ERASED';END IF;
 IF p_action='approve_erase'AND(length(trim(coalesce(m->>'file_url','')))>0 OR length(coalesce(m->>'message',''))>20000)THEN RAISE EXCEPTION 'CHAT_ATTACHMENT_OR_DETAIL_REVIEW_REQUIRED';END IF;
 IF p_action='retain'AND(p_review_on IS NULL OR p_review_on<=now())THEN RAISE EXCEPTION 'RETENTION_REVIEW_DATE_REQUIRED';END IF;
 aid:=private.require_admin_session_v147(p_session_token)::uuid;
 INSERT INTO private.kinto_privacy_chat_decisions_v1(request_id,message_id,content_hash,state,note,review_on,reviewed_by)
 VALUES(p_request_id,p_message_id,h,CASE WHEN p_action='retain'THEN 'retained'ELSE 'approved'END,trim(p_note),CASE WHEN p_action='retain'THEN p_review_on ELSE NULL END,aid)
 ON CONFLICT(request_id,message_id)DO UPDATE SET content_hash=excluded.content_hash,state=excluded.state,note=excluded.note,review_on=excluded.review_on,reviewed_by=excluded.reviewed_by,updated_at=now();
 RETURN jsonb_build_object('reviewed',true,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_chat_erase_text_v1(p_session_token text,p_request_id uuid,p_message_id bigint,p_confirm_message_id bigint)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;aid uuid;m jsonb;decision private.kinto_privacy_chat_decisions_v1;affected integer;BEGIN
 cid:=private.kinto_privacy_chat_context_v1(p_session_token,p_request_id);
 IF p_message_id IS NULL OR p_message_id IS DISTINCT FROM p_confirm_message_id THEN RAISE EXCEPTION 'EXACT_MESSAGE_CONFIRMATION_REQUIRED';END IF;
 -- Row-exclusive blocks conflicting DDL but is compatible with ordinary chat writers.
 LOCK TABLE public.messages IN ROW EXCLUSIVE MODE;
 PERFORM private.kinto_privacy_chat_context_v1(p_session_token,p_request_id);
 IF NOT private.kinto_privacy_chat_schema_v1()THEN RAISE EXCEPTION 'CHAT_SCHEMA_REVIEW_REQUIRED';END IF;
 SELECT *INTO decision FROM private.kinto_privacy_chat_decisions_v1 WHERE request_id=p_request_id AND message_id=p_message_id FOR UPDATE;
 IF decision.state='erased'THEN RETURN jsonb_build_object('erased',true,'duplicate',true,'account_deleted',false);END IF;
 IF decision.state IS DISTINCT FROM 'approved'THEN RAISE EXCEPTION 'CHAT_ERASURE_REVIEW_REQUIRED';END IF;
 SELECT to_jsonb(x)INTO m FROM public.messages x WHERE x.id=p_message_id AND x.customer_id=cid FOR UPDATE;
 IF m IS NULL OR private.kinto_privacy_chat_hash_v1(m)IS DISTINCT FROM decision.content_hash THEN RAISE EXCEPTION 'CHAT_MESSAGE_CHANGED';END IF;
 IF length(trim(coalesce(m->>'file_url','')))>0 THEN RAISE EXCEPTION 'CHAT_ATTACHMENT_OR_DETAIL_REVIEW_REQUIRED';END IF;
 DELETE FROM public.messages WHERE id=p_message_id AND customer_id=cid;
 GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>1 THEN RAISE EXCEPTION 'CHAT_ERASURE_NOT_CONFIRMED';END IF;
 UPDATE private.kinto_privacy_chat_decisions_v1 SET state='erased',note=NULL,review_on=NULL,erased_key_hash=encode(digest(cid::text||'/'||p_message_id::text,'sha256'),'hex'),erased_at=now(),updated_at=now()WHERE request_id=p_request_id AND message_id=p_message_id;
 aid:=private.require_admin_session_v147(p_session_token)::uuid;
 INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(p_request_id,'reviewed_chat_text_erased',aid);
 RETURN jsonb_build_object('erased',true,'account_deleted',false);
END$$;
CREATE FUNCTION private.kinto_privacy_chat_cancel_guard_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
BEGIN IF NEW.status='cancelled'AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(SELECT 1 FROM private.kinto_privacy_chat_decisions_v1 WHERE request_id=OLD.id AND state='erased')THEN RAISE EXCEPTION 'PRIVACY_DELETION_ALREADY_STARTED';END IF;RETURN NEW;END$$;
CREATE TRIGGER kinto_privacy_chat_cancel_v1 BEFORE UPDATE OF status ON private.kinto_deletion_requests_v1 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_chat_cancel_guard_v1();
CREATE FUNCTION private.kinto_privacy_chat_ledger_export_v1(p_offset integer DEFAULT 0,p_limit integer DEFAULT 200)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q)ORDER BY erased_at,request_id,erased_key_hash),'[]'::jsonb)FROM(SELECT request_id,erased_key_hash,erased_at FROM private.kinto_privacy_chat_decisions_v1 WHERE state='erased'ORDER BY erased_at,request_id,erased_key_hash LIMIT least(greatest(coalesce(p_limit,200),1),500)OFFSET greatest(coalesce(p_offset,0),0))q;
$$;
CREATE FUNCTION private.kinto_privacy_restore_chat_matches_v1(p_external_hashes jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE matches jsonb;BEGIN
 IF jsonb_typeof(p_external_hashes)IS DISTINCT FROM 'array'THEN RAISE EXCEPTION 'EXTERNAL_CHAT_LEDGER_REQUIRED';END IF;
 IF jsonb_array_length(p_external_hashes)NOT BETWEEN 1 AND 10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_external_hashes)x WHERE jsonb_typeof(x)<>'string'OR(x#>>'{}')!~'^[0-9a-f]{64}$')THEN RAISE EXCEPTION 'EXTERNAL_CHAT_LEDGER_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(DISTINCT encode(digest(customer_id::text||'/'||id::text,'sha256'),'hex')),'[]'::jsonb)INTO matches FROM public.messages WHERE encode(digest(customer_id::text||'/'||id::text,'sha256'),'hex')IN(SELECT jsonb_array_elements_text(p_external_hashes));
 RETURN jsonb_build_object('matched_hashes',matches,'coverage_verified',false,'restore_authorized',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_chat_hash_v1(jsonb),private.kinto_privacy_chat_context_v1(text,uuid,boolean),private.kinto_privacy_chat_schema_v1(),private.kinto_privacy_chat_cancel_guard_v1(),private.kinto_privacy_chat_ledger_export_v1(integer,integer),private.kinto_privacy_restore_chat_matches_v1(jsonb)FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_privacy_chat_review_v1(text,uuid,text,bigint,text,text,timestamptz,bigint),public.kinto_privacy_chat_erase_text_v1(text,uuid,bigint,bigint)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_chat_review_v1(text,uuid,text,bigint,text,text,timestamptz,bigint)TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_chat_erase_text_v1(text,uuid,bigint,bigint)TO service_role;
-- Strict recognition of the current stored attachment contract only. Legacy/encoded
-- paths stay unresolved. No caller-selected host, bucket, object path or Storage call.
CREATE FUNCTION private.kinto_privacy_chat_file_key_v1(p_url text)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT (regexp_match(p_url,'^https://hsmmbloouskqdnptiiad[.]supabase[.]co/storage/v1/object/(?:public|sign|authenticated)/chat-attachments/((?:customer|admin|employee|courier)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-z0-9]{1,10})(?:[?][^#[:space:]]*)?$'))[1];
$$;
CREATE FUNCTION private.kinto_privacy_chat_details_v1(p_details jsonb)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF jsonb_typeof(p_details)='object' THEN RETURN p_details;END IF;
 IF jsonb_typeof(p_details)='string' THEN RETURN (p_details#>>'{}')::jsonb;END IF;
 RETURN NULL;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END$$;
-- Assessment never grants erasure, even if all known reference checks are clear.
CREATE FUNCTION public.kinto_privacy_chat_attachment_v1(p_session_token text,p_request_id uuid,p_message_id bigint,p_expected_hash text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' SET statement_timeout='5s' AS $$
DECLARE cid uuid;m jsonb;k text;t jsonb;ticket_count integer;shared boolean;operational boolean;unresolved boolean;holds jsonb:='["COVERAGE_NOT_VERIFIED","HUMAN_RETENTION_REVIEW_REQUIRED","UPLOAD_QUIESCENCE_NOT_VERIFIED"]';
BEGIN
 cid:=private.kinto_privacy_chat_context_v1(p_session_token,p_request_id,false);
 IF NOT private.kinto_privacy_chat_schema_v1()THEN RAISE EXCEPTION 'CHAT_SCHEMA_REVIEW_REQUIRED';END IF;
 SELECT to_jsonb(x)INTO m FROM public.messages x WHERE x.id=p_message_id AND x.customer_id=cid;
 IF m IS NULL THEN RAISE EXCEPTION 'OWNED_CHAT_MESSAGE_REQUIRED';END IF;
 IF p_expected_hash IS DISTINCT FROM private.kinto_privacy_chat_hash_v1(m)THEN RAISE EXCEPTION 'CHAT_MESSAGE_CHANGED';END IF;
 IF length(trim(coalesce(m->>'file_url','')))=0 THEN RAISE EXCEPTION 'CHAT_ATTACHMENT_REQUIRED';END IF;
 k:=private.kinto_privacy_chat_file_key_v1(m->>'file_url');
 IF k IS NULL THEN holds:=holds||'"UNRESOLVED_REFERENCE"'::jsonb;
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.messages x WHERE x.id<>p_message_id AND private.kinto_privacy_chat_file_key_v1(x.file_url)=k),
   EXISTS(SELECT 1 FROM public.messages x WHERE length(trim(coalesce(x.file_url,'')))>0 AND private.kinto_privacy_chat_file_key_v1(x.file_url)IS NULL)
  INTO shared,unresolved;
  IF shared THEN holds:=holds||'"SHARED_MESSAGE_REFERENCE"'::jsonb;END IF;
  IF unresolved THEN holds:=holds||'"UNRESOLVED_OTHER_REFERENCE"'::jsonb;END IF;
  IF to_regclass('public.orders')IS NULL THEN holds:=holds||'"OPERATIONAL_REFERENCE_CHECK_UNAVAILABLE"'::jsonb;
  ELSE
   -- Include frozen fields and both JSONB and JSON-encoded TEXT details. This is
   -- known orders scope only, not a claim to have discovered all 149 relations.
   SELECT EXISTS(SELECT 1 FROM public.orders o CROSS JOIN LATERAL jsonb_path_query(jsonb_build_array(to_jsonb(o),private.kinto_privacy_chat_details_v1(to_jsonb(o)->'details')),'$.** ? (@.type() == "string")')v WHERE private.kinto_privacy_chat_file_key_v1(v#>>'{}')=k)INTO operational;
   IF operational THEN holds:=holds||'"PROTECTED_OPERATIONAL_REFERENCE"'::jsonb;END IF;
  END IF;
  IF to_regclass('private.kinto_attachment_tickets_v1')IS NULL THEN holds:=holds||'"UPLOAD_TICKET_CHECK_UNAVAILABLE"'::jsonb;
  ELSE
   EXECUTE 'SELECT count(*),min(to_jsonb(x)::text)::jsonb FROM private.kinto_attachment_tickets_v1 x WHERE to_jsonb(x)->>''path''=$1'INTO ticket_count,t USING k;
   IF ticket_count<>1 OR t->>'purpose'IS DISTINCT FROM 'chat' OR t->>'target_id'IS DISTINCT FROM cid::text OR coalesce(t->>'actor_role','')NOT IN('customer','admin','employee')OR(t->>'actor_role'='customer'AND t->>'actor_id'IS DISTINCT FROM cid::text)THEN holds:=holds||'"UPLOAD_TICKET_OWNERSHIP_NOT_VERIFIED"'::jsonb;
   ELSE
    BEGIN
     IF (t->>'expires_at')::timestamptz IS NULL THEN holds:=holds||'"UPLOAD_TICKET_STATE_NOT_VERIFIED"'::jsonb;
     ELSIF(t->>'expires_at')::timestamptz>now()THEN holds:=holds||'"UPLOAD_AUTHORIZATION_ACTIVE"'::jsonb;END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN holds:=holds||'"UPLOAD_TICKET_STATE_NOT_VERIFIED"'::jsonb;END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('message_id',p_message_id::text,'holds',holds,'coverage_verified',false,'deletion_authorized',false,'account_deleted',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_chat_file_key_v1(text),private.kinto_privacy_chat_details_v1(jsonb),public.kinto_privacy_chat_attachment_v1(text,uuid,bigint,text)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_chat_attachment_v1(text,uuid,bigint,text)TO anon,authenticated,service_role;

COMMIT;
